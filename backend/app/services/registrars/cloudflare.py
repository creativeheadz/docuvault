"""Cloudflare Registrar provider.

Lists domains registered through Cloudflare Registrar
(`/accounts/{id}/registrar/domains`). If no account id is supplied we
enumerate every account the token can see and aggregate. Domains using
Cloudflare for DNS only (registered elsewhere) do not appear here — by
design, this tracks registrations/expiry.
"""

from __future__ import annotations

import httpx

from app.services.registrars.base import (
    CredField,
    NormalizedDomain,
    RegistrarError,
    RegistrarProvider,
)

_BASE_URL = "https://api.cloudflare.com/client/v4"


class CloudflareProvider(RegistrarProvider):
    key = "cloudflare"
    label = "Cloudflare"
    fields = [
        CredField("api_token", "API Token", secret=True),
        CredField(
            "account_id",
            "Account ID",
            optional=True,
            placeholder="blank = all accounts the token can see",
        ),
    ]

    async def list_domains(self, creds: dict[str, str]) -> list[NormalizedDomain]:
        headers = {
            "Authorization": f"Bearer {creds['api_token']}",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(
            base_url=_BASE_URL, headers=headers, timeout=30.0
        ) as http:
            account_id = (creds.get("account_id") or "").strip()
            account_ids = (
                [account_id] if account_id else await self._all_account_ids(http)
            )

            domains: list[NormalizedDomain] = []
            for aid in account_ids:
                try:
                    resp = await http.get(f"/accounts/{aid}/registrar/domains")
                    resp.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    code = exc.response.status_code
                    if code in (401, 403):
                        raise RegistrarError(
                            "Cloudflare rejected the token (check it has "
                            "Account → Domain API Tokens read access)"
                        ) from exc
                    raise RegistrarError(f"Cloudflare API error {code}") from exc
                except httpx.HTTPError as exc:
                    raise RegistrarError(f"Cloudflare unreachable: {exc}") from exc

                result = resp.json().get("result") or []
                for d in result:
                    statuses = d.get("registry_statuses")
                    domains.append(
                        NormalizedDomain(
                            name=d.get("name") or "",
                            expiration_date=d.get("expires_at"),
                            auto_renew=d.get("auto_renew"),
                            status=statuses if isinstance(statuses, str) else None,
                        )
                    )
            return domains

    async def _all_account_ids(self, http: httpx.AsyncClient) -> list[str]:
        try:
            resp = await http.get("/accounts", params={"per_page": 50})
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (401, 403):
                raise RegistrarError(
                    "Cloudflare rejected the token while listing accounts"
                ) from exc
            raise RegistrarError(
                f"Cloudflare API error {exc.response.status_code}"
            ) from exc
        except httpx.HTTPError as exc:
            raise RegistrarError(f"Cloudflare unreachable: {exc}") from exc

        result = resp.json().get("result") or []
        ids = [a["id"] for a in result if a.get("id")]
        if not ids:
            raise RegistrarError("Cloudflare token can see no accounts")
        return ids
