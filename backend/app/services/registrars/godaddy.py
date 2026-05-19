"""GoDaddy Domains provider.

GET /v1/domains returns the account's domains with `expires` and
`renewAuto` inline — no fan-out needed. Auth header is
``Authorization: sso-key {KEY}:{SECRET}``.

Note: GoDaddy restricts production API access to accounts with 10+
domains or reseller plans; smaller accounts get HTTP 403.
"""

from __future__ import annotations

import httpx

from app.services.registrars.base import (
    CredField,
    NormalizedDomain,
    RegistrarError,
    RegistrarProvider,
)

_BASE_URL = "https://api.godaddy.com"


class GoDaddyProvider(RegistrarProvider):
    key = "godaddy"
    label = "GoDaddy"
    fields = [
        CredField("api_key", "API Key"),
        CredField("api_secret", "API Secret", secret=True),
    ]

    async def list_domains(self, creds: dict[str, str]) -> list[NormalizedDomain]:
        headers = {
            "Authorization": f"sso-key {creds['api_key']}:{creds['api_secret']}",
            "Accept": "application/json",
        }
        async with httpx.AsyncClient(
            base_url=_BASE_URL, headers=headers, timeout=30.0
        ) as http:
            try:
                resp = await http.get(
                    "/v1/domains",
                    params={"limit": 1000, "statuses": "ACTIVE"},
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                code = exc.response.status_code
                if code in (401, 403):
                    raise RegistrarError(
                        "GoDaddy rejected the key (401/403) — note the API "
                        "requires a 10+ domain or reseller account"
                    ) from exc
                raise RegistrarError(f"GoDaddy API error {code}") from exc
            except httpx.HTTPError as exc:
                raise RegistrarError(f"GoDaddy unreachable: {exc}") from exc

            data = resp.json()
            if not isinstance(data, list):
                return []
            domains: list[NormalizedDomain] = []
            for d in data:
                domains.append(
                    NormalizedDomain(
                        name=d.get("domain") or "",
                        expiration_date=d.get("expires"),
                        auto_renew=d.get("renewAuto"),
                        status=d.get("status"),
                    )
                )
            return domains
