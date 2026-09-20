# DocuVault — pre-exposure security assessment

**Date:** 2026-09-20
**Target:** DocuVault VM `192.168.1.203` (`~/docuvault`, branch `feature/uptime-kuma`, `aa226df`)
**Scope:** authorised assessment of our own deployment, ahead of a decision to publish it on the internet.
**Method:** source review of `backend/app` + live probing of the running instance from the workstation `192.168.1.142`. No third-party systems were touched.

---

## Verdict

**Do not expose this deployment to the internet in its current state.** Not because DocuVault is badly built — the newest code in it (the integration API) is the best-secured thing in the repo — but because the *deployment* is still running on the demo secrets that ship as literals in `backend/app/config.py`. Everything below flows from that single fact.

The good news is that the fix for the top three findings is roughly twenty minutes of work and one container restart.

---

## Findings

Severity is judged **against an internet-facing deployment**. On the LAN-only deployment we actually have today, most of these are a good deal less urgent.

### C1 — The JWT signing key is a public literal; authentication is bypassable · CRITICAL

`backend/app/config.py:7` ships `SECRET_KEY = "super-secret-key-change-in-production"`, and the live `.env` on `.203` sets that exact value. Anyone with the source can mint a token for any user.

**Verified.** I read the `sub` claim out of an MFA-pending token, signed a fresh `{"type":"access"}` token with the literal from the repo, and used it against the running instance:

```
FORGED TOKEN -> /api/v1/auth/me        : 200  (186 bytes)
FORGED TOKEN -> /api/v1/organizations  : 200  (3382 bytes of live client data)
```

Note what this defeats: the seed account **does** have TOTP enabled, and password login correctly stops at `mfa_required: true`. The forged token walks straight past it, because MFA is enforced at the login route and nothing re-checks it once a token exists. MFA is not a mitigation when the key is public.

**Fix:** `python -c "import secrets; print(secrets.token_urlsafe(64))"` into `SECRET_KEY`, restart. Every existing session is invalidated, which is what we want.

### C2 — The password-vault encryption key is a public literal · CRITICAL

`config.py:8` ships `ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="` — base64 of the ASCII string `01234567890123456789012345678901`. The live `.env` uses it. Every AES-GCM ciphertext in the database is therefore readable by anyone holding the repo.

**Verified end-to-end from outside the application.** I connected to Postgres over the LAN, pulled `app_settings`, and decrypted the IONOS registrar secret using only the literal committed in `config.py`:

```
AUTH OK (SCRAM) — compose-default DB credential accepted from 192.168.1.142
registrars.secret: DECRYPTED OK -> 86 chars (value withheld)
```

The `passwords` table happens to be empty right now (the vault data did not survive the 2026-08-08 rebuild), so no client passwords are currently at risk. That is luck, not design — and it will stop being true the moment the vault gets used.

**Fix:** generate a real key, but note the ordering trap — **rotating `ENCRYPTION_KEY` makes every existing ciphertext undecryptable.** With the vault empty, the only rows that matter are the two `app_settings` entries. Re-enter the IONOS credential and the Uptime Kuma key through the UI after the rotation and you are clean. Doing this later, with a populated vault, means writing a re-encryption migration.

### C3 — MeshCentral admin credentials are stored in plaintext · CRITICAL

`app_settings['meshcentral']` holds its username and password as bare JSON. `backend/app/services/meshcentral_service.py` never imports `app.core.encryption` at all — unlike `uptime_service.py` and `registrar_service.py`, which both encrypt their secrets properly. This looks like an oversight rather than a decision.

The credential is for `vsa.oldforge.tech`, which **is** internet-facing (it has a vhost on `.172`), and MeshCentral grants remote desktop and terminal on every managed device.

**Action, independent of everything else in this document: rotate that MeshCentral password now.** It appeared in plaintext in this session's output, so treat it as disclosed regardless of what we decide about exposure. Then fix the storage to match the other two providers.

### H1 — Authentication without authorisation · HIGH

There is no permission model. `backend/app/models/user.py` has no role, no admin flag, no organisation link. Every route in all 34 routers reads `_: User = Depends(get_current_user)` and then queries unscoped — `reveal_password` is a bare `select(Password).where(Password.id == item_id)` with no ownership check.

So **any** authenticated user can read, reveal, and delete **any** record belonging to **any** organisation. For a single-user LAN instance that is a reasonable simplification. It is also precisely why the multi-tenancy question you asked about has only one honest answer for this codebase — see the companion document.

### H2 — Post-authentication SSRF into the LAN · HIGH

An authenticated user sets the target URLs for Uptime Kuma, MemPalace, MeshCentral, the domain prober, and webhooks. The server fetches them with `follow_redirects=True` and no address filtering (`uptime_service.py:208`, `mempalace_client.py:66`, `domain_probe.py:57`, `meshcentral_service.py:47`).

Combined with C1, that is *unauthenticated* SSRF from the internet into a LAN that also hosts Infisical, MeshCentral, Kaseya VSA and the rest of the estate. Chained after C1 this is arguably worse than the data exposure itself.

**Fix:** a shared allow-list helper — resolve the hostname, reject RFC1918/loopback/link-local/metadata addresses, cap redirects, re-check after each hop.

### H3 — No rate limiting anywhere · HIGH

Nothing in `backend/` or `pyproject.toml` implements throttling; the only match for "rate limit" in the whole backend is a handler for Anthropic's own 429. That leaves `/auth/login` open to unlimited password guessing and — more interestingly — `/auth/mfa-verify` open to unlimited TOTP guessing against a 5-minute `mfa_pending` token. nginx has no `limit_req` either.

### M1 — Session cookies are not marked `Secure` · MEDIUM

All six `set_cookie` calls in `api/v1/auth.py` pass `httponly=True, samesite="lax"` and omit `secure=True`, so the browser will send the session over plain HTTP. `SameSite=Lax` does cover the CSRF case adequately; this is specifically about transport.

### M2 — Refresh tokens cannot be revoked · MEDIUM

`/auth/refresh` accepts any correctly-signed refresh token and mints a fresh pair, with no server-side record and no rotation tracking. `/auth/logout` only clears cookies — a stolen refresh token stays valid for its full 7 days and can be renewed indefinitely. There is no way to kick a session.

### M3 — Arbitrary file write via the attachment upload · MEDIUM

`api/v1/attachments.py:41`:

```python
upload_dir = os.path.join(settings.UPLOAD_DIR, attachable_type, attachable_id)
```

`attachable_type` arrives as an unvalidated `Form(...)` string. `os.path.join` discards everything to the left of an absolute path, so `attachable_type="/etc/cron.d"` writes outside `UPLOAD_DIR` entirely; `../` works too. `makedirs` and the file write both happen *before* `uuid.UUID(attachable_id)` would reject a bad id, so the write lands even when the request then 500s. The filename is a server-generated UUID with a caller-controlled extension, so this is arbitrary *placement*, not arbitrary *overwrite* — contained to the container, but it should not be reachable.

Same file, same route: `content = await file.read()` loads the whole upload into memory with no size cap. nginx's 1 MB default covers the `:3000` path; port `:8000` has no cap at all.

### M4 — `/openapi.json` and `/docs` are unauthenticated · MEDIUM

FastAPI's defaults are left on, publishing all 115 paths (verified). Via the frontend nginx this is not reachable — only `/api/` is proxied — but it is wide open on `:8000`.

### L1 — Webhook secrets are echoed back · LOW

`WebhookResponse` includes `secret`, so the list endpoint returns every webhook signing secret in clear. Write-only would be the right shape.

### L2 — No security headers · LOW

Neither `frontend/nginx.conf` nor the vhost template on `.172` sets HSTS, `X-Frame-Options`, `X-Content-Type-Options` or a CSP.

---

## Deployment-level findings

| | |
|---|---|
| **UFW is inactive** on `.203` | verified — `Status: inactive` |
| **Postgres listens on `0.0.0.0:5434`** with the compose-default password `docuvault_secret` | verified — I authenticated from `.142` and read the schema |
| **Backend listens on `0.0.0.0:8000`**, bypassing the frontend nginx | verified — every finding above is reachable there directly |
| Seed credentials are the committed defaults | verified — `andrei.trimbitas` / the literal in `config.py`; login reached `mfa_required` |
| `.env` is correctly gitignored, and no secret has ever been committed | verified across all history |

The ports are the deployment equivalent of H1: the app's own nginx is the only thing shaping traffic, and nothing forces callers through it.

## What is genuinely well built

Worth saying plainly, because it is the model for the rest:

- **The integration API (`core/api_auth.py`, `models/api_token.py`) is exemplary.** A separate credential type on a separate header wired into exactly one router, so that "this key cannot reach a password" is structural rather than a matter of care. Tokens are SHA-256 at rest, shown once, scoped, revocable, expiring, with the reasoning written down next to the code. The 404-not-403 choice for out-of-scope organisations is the right call.
- **Every raw SQL statement uses bound parameters.** No injection anywhere.
- **bcrypt for passwords, AES-GCM for secrets** — correct primitives, correctly used. The key is the problem, never the crypto.
- **MFA is real TOTP** and is enabled on the live account.
- **Password reveals are audit-logged** with actor and IP.

## Recommended order

**Before any public exposure:**
1. Rotate the MeshCentral password (do this today regardless).
2. New `SECRET_KEY`, new `ENCRYPTION_KEY`, new `POSTGRES_PASSWORD`, new seed password — while the vault is empty and rotation is free.
3. Change the `config.py` defaults from working values to something that refuses to boot, so this cannot recur. A deployment should fail loudly rather than silently run on demo keys.
4. Bind `8000` and `5434` to `127.0.0.1` in `docker-compose.yml`; enable UFW.
5. Rate-limit `/auth/login` and `/auth/mfa-verify`; add `limit_req` at the edge.
6. `secure=True` on the cookies; disable `/docs` and `/openapi.json` in production.

**Before it is more than a probing target:**
7. SSRF allow-list on every outbound fetch.
8. A real authorisation model — or, better, the isolation model in the companion document, which makes H1 moot by construction.
9. Server-side refresh-token records so sessions can be revoked.
10. Fix the attachment path handling and cap the upload size.

---

## Addendum — what was done on 2026-09-20

Hardened first, then exposed, in that order.

### Fixed on `192.168.1.203`

| | |
|---|---|
| `SECRET_KEY` | rotated to 64 random bytes — **C1 closed**, verified by replaying the old forgery (401) |
| `ENCRYPTION_KEY` | rotated to a fresh 32-byte key — **C2 closed**. The one encrypted field in the database (`registrars.ionos.secret`) was decrypted under the old key and re-encrypted under the new one in the same pass, so nothing was lost and the IONOS credential still works |
| `POSTGRES_PASSWORD` | rotated; `ALTER ROLE` applied and `.env` / `DATABASE_URL` / `DATABASE_URL_SYNC` updated together |
| Seed account password | rotated to 24 random characters. The new value is the `SEED_PASSWORD` line in `~/docuvault/.env` on the VM — it was deliberately not written into a chat transcript, which is how the previous one got out |
| Postgres host port | **removed entirely.** The backend reaches it over the compose network; it never needed one |
| Backend host port | bound to `127.0.0.1:8000` — the unproxied API is no longer reachable off-box |
| Frontend host port | bound to `192.168.1.203:3000` rather than `0.0.0.0`, dropping the IPv6 listener too |

Port changes live in an untracked `docker-compose.override.yml` on the VM, so the `git fetch && git reset --hard` deploy flow will not wipe them. The old `.env` is kept at `.env.bak-20260920` (mode 600) until you are happy; shred it after.

### Fixed at the edge (`crm.oldforge.tech` on `.172`)

Supplied in nginx rather than in the app, so no code change and no deploy was needed:

- **H3, rate limiting** — `/api/v1/auth/(login|mfa-verify|refresh)` at 10/min per address with a burst of 5; the rest of `/api/` at 120/min. Verified: 15 rapid login attempts gave `401 ×6` then `429 ×9`.
- **M1, cookie `Secure`** — `proxy_cookie_flags ~ secure` adds the flag in transit on every proxied response.
- **L2, security headers** — HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`. A CSP is present as **Report-Only**; check the browser console, then promote it to the enforcing header.
- **M3, upload size** — `client_max_body_size 25m` bounds the unbounded `await file.read()`.
- `server_tokens off`, `limit_conn 32`, 300s read timeout for the AI chat rounds.
- **M4** — only `/api/` reaches the backend, so `/docs`, `/redoc` and `/openapi.json` return the SPA fallback rather than the API schema. Verified.

### One thing the exposure itself taught us

The hostname was chosen to be non-obvious. It bought nothing, and the log says so precisely.

Let's Encrypt publishes every certificate it issues to **public Certificate Transparency logs**, which scanners watch in real time. Within **90 seconds** of the certificate being issued, `leakix.net` was probing the host for GraphQL endpoints, Jira `pom.properties`, Spring `actuator/env`, Laravel Telescope, `.vscode/sftp.json`, `info.php` and `trace.axd`. Inside ten minutes: 66 requests from 11 distinct addresses across four continents. Nothing found anything — every probe got a 404 or the SPA fallback, and the only `/api/` requests from outside were two GraphQL guesses.

`crm.oldforge.tech` also has **eight CT entries from 2023–24** under a previous use, so the name was already in scanner wordlists before today.

The lesson for the provisioning design: **every tenant subdomain is public the moment its certificate issues.** Obscurity is not available as a control, tenant names leak the customer list, and a wildcard certificate — which the conception recommends for other reasons — has the side benefit of publishing `*.docuvault.<tld>` once instead of naming every customer in a public log.

### Still open

Not blocking exposure, but they are the next tranche, and all of them need code:

1. **H2, SSRF** — no allow-list on outbound fetches. Highest remaining risk, because the LAN behind it is the interesting target.
2. **C3, MeshCentral credentials in plaintext** — and **rotate that password regardless**, it was disclosed during this assessment.
3. **H1** — no authorisation model. Resolved structurally by the provisioning conception rather than by patching.
4. **M2** — refresh tokens still cannot be revoked.
5. **M3** — the `os.path.join` traversal in the attachment upload is still reachable by an authenticated user.
6. **L1** — webhook secrets still returned by the API.
7. `config.py` still carries working demo defaults. They should refuse to boot instead.
