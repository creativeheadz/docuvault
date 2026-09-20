# DocuVault provisioning — a conception

**Date:** 2026-09-20
**Status:** design proposal, nothing built
**Reference implementation:** Felgate (`github.com/creativeheadz/felgate`, running on `192.168.1.45`), whose control plane already proves this shape end to end.

---

## The thesis

A tenant is not a row with a `tenant_id`. A tenant is **a running instance**.

Shared-database multi-tenancy makes isolation a property of every query you will ever write — one forgotten `WHERE tenant_id = ?` in one endpoint, once, and a customer sees another customer's data. In a product whose entire job is holding other people's credentials, that bet is badly priced. Isolation should be a property of the *topology*, where it holds by construction and stays held by people who join later and have never read this document.

Felgate already took this position and shipped it. This document is that architecture applied to DocuVault, with three deliberate departures where DocuVault's shape allows something better.

**The central observation: DocuVault's existing `docker-compose.yml` is already the tenant unit.** Three containers, two volumes, migrations that run themselves in the FastAPI lifespan, a seed user created from env. `docker compose up` with a per-tenant env file is genuinely most of the provisioning story. We are not rebuilding the product for multi-tenancy — we are wrapping the thing that already exists.

---

## Topology

```
                 internet
                     │
          81.150.150.132  (NAT)
                     │
   ┌─────────────────▼──────────────────┐
   │  edge nginx  (yggdrasil, .172)     │   wildcard TLS for *.docuvault.<tld>
   │  routes by Host header             │   serves the shared static bundle
   └──┬──────────────┬──────────────┬───┘   proxies /api/ per tenant
      │              │              │
   ┌──▼───┐      ┌───▼──┐      ┌────▼────┐
   │ CP   │      │tenant│      │ tenant  │
   │portal│      │ acme │      │ borvax  │
   └──┬───┘      └──┬───┘      └────┬────┘
      │             │               │
   ┌──▼───┐   ┌─────▼─────┐   ┌─────▼─────┐
   │ cp db│   │ pg + vol  │   │ pg + vol  │
   └──────┘   └───────────┘   └───────────┘
              └── one compose project per tenant ──┘
```

Per tenant, on the tenant host:

| Component | Per tenant? | Why |
|---|---|---|
| `backend` container | **yes** | holds the tenant's secret scope in its environment; process isolation |
| `postgres` container + volume | **yes** | the isolation boundary that matters; deprovision is `down -v` |
| `uploads` volume | **yes** | attachments are tenant data |
| `frontend` container | **no** | the bundle is byte-identical for every tenant and contains no tenant data |
| nginx edge | **no** | one config directory, one route file per tenant |

Dropping the per-tenant frontend container is departure #1 from Felgate. DocuVault's frontend container is just nginx serving static files and proxying `/api/`; the edge can do both. It removes a container and a moving part per tenant, and tenant branding belongs in an API response at runtime, not in a per-tenant build.

### Why a Postgres container per tenant, not a database per tenant on a shared cluster

The usual compromise is database-per-tenant on one HA cluster: one WAL pipeline, one PITR story, one thing to tune. It is the right answer at a thousand tenants.

It is the wrong answer here, for three reasons:

1. **At our scale the cost is noise.** A hundred tenants at a tuned ~60 MB idle is ~6 GB. That is one VM.
2. **It preserves the "it is just compose" property**, which is the thing that makes the whole plan cheap. A shared cluster means the control plane grows a privileged role that can `CREATE DATABASE` across every tenant — exactly the central credential we are trying not to have.
3. **Erasure, backup and restore become per-tenant operations** rather than careful ones. Right-to-erasure is `docker compose -p docuvault-<slug> down -v`. Restoring one customer to last Tuesday never touches another customer.

The cost is honest and should be written down: N Postgres instances to patch, and no shared PITR. Both are control-plane problems (rolling image upgrades; per-tenant `pg_dump` plus volume snapshot on a schedule), and both are cheaper than the class of bug we are buying our way out of.

The dial, when someone asks for more: **dedicated VM per tenant** for an enterprise tier, provisioned the same way with a different driver. Same control plane, same state machine, different `provisioner` implementation.

### Where the keys live — the one design point worth arguing about

The tension in "isolated tenants, central control plane" is that a control plane which generates and stores every tenant's `ENCRYPTION_KEY` *is* the shared-database problem, moved. Compromise it and you have every vault. Per-tenant containers would then be theatre.

**Proposal: the control plane never holds a tenant's keys.** We already run Infisical at `secret.oldforge.tech`. On provision:

1. The control plane creates an Infisical project path `/docuvault/<slug>` and a machine identity scoped to *only* that path.
2. It generates `SECRET_KEY`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, writes them to that path, and **does not persist them**.
3. The tenant container gets the machine identity credential in its environment and fetches its own secrets at boot.
4. The control plane stores the path and the identity id. Not the secrets.

A compromised control plane can then create, suspend and destroy tenants — which is bad, and loud — but cannot read one. That is a meaningfully different blast radius, and it is the property to design for.

Phase 1 can ship the simpler version (secrets injected at container creation and never written to the control-plane database, living only in the container config) as long as the interface is the same, so the Infisical driver drops in later. What must *not* happen is a `tenants.encryption_key` column. Once that exists it never leaves.

---

## The control plane

A separate FastAPI application with its own database, its own domain, and no route that can read tenant data. Departure #2 from Felgate, which is Flask: DocuVault is FastAPI and the operational knowledge should be shared, not doubled.

It owns exactly five things:

1. **The tenant registry** — slug, display name, state, image tag, host, secret path, created/suspended dates. No tenant content, ever.
2. **The provisioning state machine** (below).
3. **Routing and DNS** — writes one nginx file per tenant into a shared directory, reloads.
4. **Fleet health and version** — which tenants are up, which image tag each runs, which are behind on migrations.
5. **Billing** — Stripe subscription ↔ tenant lifecycle.

### The provisioning sequence

Felgate's sequence, proven in production, with departure #3 at step 6:

```
signup → payment → slug allocation → secret scope → database + volume
   → container up → wait healthy → write nginx route → verify through the edge
   → mark ACTIVE → owner activation email
```

**Departure #3: no per-tenant DNS call and no per-tenant certificate.** Felgate creates an IONOS A record per tenant and issues a cert per tenant. Instead:

- one wildcard A record, `*.docuvault.<tld> → 81.150.150.132`, created once;
- one wildcard certificate, `*.docuvault.<tld>`, issued once via ACME **DNS-01** and renewed on a timer.

This removes the two slowest and least reliable steps from every provision. A tenant goes live in seconds, not minutes, with no DNS propagation wait, no Let's Encrypt rate limit, and no per-tenant failure mode. It is strictly better, and it is available to us only because every tenant lives under one parent domain.

One caveat, already learned the hard way: IONOS's API is awkward for the DNS-01 challenge dance. If it fights us, move that single domain's nameservers to Cloudflare and keep the registration at IONOS. It affects one domain and nothing else in the estate.

Custom domains (`docs.customer.co.uk`) are a later, per-tenant exception that *does* need its own record and its own cert — which is fine, because by then it is an upsell with a human in the loop.

### States

```
pending → provisioning → active ⇄ suspended → deprovisioning → deleted
                │
                └→ failed  (retryable; reconciler re-drives)
```

Two properties, both learned from Felgate:

- **Every step is idempotent.** Stripe retries webhooks; a provision that runs twice must produce one tenant. Each step checks for its own output before doing work.
- **Every step fails loudly.** Felgate has a commit whose whole message is *"fail loud when the nginx route can't be written"*. A provisioning step that swallows an error hands a customer a tenant that is half alive, which is worse than one that never appeared.

A reconciler loop compares desired state to observed state and re-drives anything stuck, so a control-plane restart mid-provision is a non-event.

### Upgrades — the real cost of this model

One instance is easy. Eighty instances is the thing that actually decides whether this architecture is pleasant to live with, so it needs a design rather than a hope:

- **Every tenant pins an image tag.** Never `:latest`. The registry row is the source of truth for what a tenant runs.
- **Migrations already run themselves** in the FastAPI lifespan. That is exactly right here and should not change.
- **Upgrades are a control-plane operation**: set the target tag, then roll — one canary tenant, verify, then batches with a health gate between them, and stop the roll on the first failure.
- **The tenant reports its own version.** Extend `/api/health` to return the image tag and the alembic revision, so the fleet view answers "who is behind" without SSH.
- **A broken migration takes one tenant down, not the product.** This is the compensating upside, and it is a large one.

---

## What this does to the security findings

This is not a tangent from the assessment — it resolves its biggest structural finding.

**H1 (authentication without authorisation)** largely dissolves. Today every authenticated user can read every organisation's data because there is no permission model. Under instance-per-tenant that is no longer a bug: the instance *is* the boundary, and "any user of this instance sees this instance's data" is the correct semantics rather than an accident. We would still want roles *within* a tenant eventually (a junior tech who cannot reveal passwords), but that becomes a product feature rather than a load-bearing security control.

**C1 and C2 become structurally impossible to repeat** — per-tenant generated keys mean there is no shared default to forget, and a leaked key costs exactly one tenant.

And it makes the harder promise sellable: *your credentials are in your own database, in your own container, encrypted with a key that is yours, and I can prove it by showing you that deleting you is one command.* No shared-database competitor can say that sentence.

---

## Phasing

**Phase 0 — harden the single instance** (days). Everything in the assessment's "before any public exposure" list. Independent of all of this, and required regardless.

**Phase 1 — make the tenant unit real** (1–2 weeks). Parameterise the compose project; per-tenant generated secrets; drop the per-tenant frontend; wildcard DNS and cert; provision a second instance by hand and run both side by side. This is the phase that proves the thesis, and it needs no control plane at all.

**Phase 2 — the control plane** (2–4 weeks). Registry, state machine, provisioner driver, nginx route writer, reconciler, fleet health. Operator-driven: you click "new tenant". No billing, no self-serve. This is where Felgate's code is directly liftable.

**Phase 3 — self-serve** (2–3 weeks). Signup, Stripe, webhooks, activation email, suspend-on-nonpayment, deprovision-on-cancel.

**Phase 4 — the dials.** Custom domains, dedicated-VM tier, per-tenant backup schedules, and the optional integration levels (none, Wegweiser, other) that were always the plan for selling DocuVault as its own product.

Phases 1 and 2 are where the value is. Phase 3 can wait indefinitely — an operator-provisioned tenant is a perfectly good product for the first dozen customers, and it avoids building a signup funnel before knowing who is walking through it.

---

## Open decisions

1. **The domain.** There is no `docuvault.*` domain in the IONOS account. The wildcard model needs one parent domain, chosen once and hard to change later.
2. **Where tenants run.** `.203` is a single VM sized for one instance. A tenant host needs its own box and its own sizing.
3. **Infisical now or later** — i.e. whether Phase 1 ships the real secret-scope design or the interface-compatible placeholder.
4. **The control plane's own domain**, which the diary suggests was leaning towards `oldforge.tech`.
