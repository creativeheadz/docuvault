"""IONOS Domains provider.

List endpoint returns id/name/tld only; per-domain detail carries the
expiration date and auto-renew flag, so we fan out (bounded concurrency)
to the detail endpoint.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from typing import Any

from app.services.registrars.base import (
    CredField,
    DnsRecord,
    NormalizedDomain,
    RegistrarError,
    RegistrarProvider,
)

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.hosting.ionos.com"
_DETAIL_CONCURRENCY = 6


_RECORD_TYPES = {"A", "AAAA", "CNAME", "MX", "NS", "SRV", "TXT", "CAA", "TLSA", "DS"}


class IonosProvider(RegistrarProvider):
    key = "ionos"
    label = "IONOS"
    supports_dns = True
    fields = [
        CredField("prefix", "Public Prefix", placeholder="e.g. de85e10635164353…"),
        CredField("secret", "Secret", secret=True),
    ]

    def _http(self, creds: dict[str, str]) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=_BASE_URL,
            headers={
                "X-API-Key": f"{creds['prefix']}.{creds['secret']}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    @staticmethod
    def _raise(exc: httpx.HTTPStatusError, what: str) -> None:
        code = exc.response.status_code
        if code in (401, 403):
            raise RegistrarError("Invalid IONOS API key") from exc
        if code == 404:
            raise RegistrarError(f"{what} not found") from exc
        detail = ""
        try:
            body = exc.response.json()
            detail = body[0].get("message", "") if isinstance(body, list) else ""
        except Exception:  # noqa: BLE001
            detail = exc.response.text[:200]
        raise RegistrarError(f"IONOS error {code}: {detail}".strip()) from exc

    async def _zone_id(self, http: httpx.AsyncClient, domain: str) -> str:
        try:
            resp = await http.get("/dns/v1/zones")
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            self._raise(exc, "Zones")
        except httpx.HTTPError as exc:
            raise RegistrarError(f"IONOS unreachable: {exc}") from exc
        for z in resp.json():
            if z.get("name") == domain:
                return z["id"]
        raise RegistrarError(f"No DNS zone for {domain}")

    @staticmethod
    def _clean_record(rec: dict[str, Any]) -> dict[str, Any]:
        rtype = str(rec.get("type", "")).upper()
        if rtype not in _RECORD_TYPES:
            raise RegistrarError(f"Unsupported record type '{rtype}'")
        out: dict[str, Any] = {
            "name": str(rec.get("name", "")).strip(),
            "type": rtype,
            "content": str(rec.get("content", "")).strip(),
            "disabled": bool(rec.get("disabled", False)),
        }
        if not out["name"] or not out["content"]:
            raise RegistrarError("Record name and content are required")
        ttl = rec.get("ttl")
        if ttl not in (None, ""):
            out["ttl"] = int(ttl)
        prio = rec.get("prio")
        if prio not in (None, "") and rtype in ("MX", "SRV"):
            out["prio"] = int(prio)
        return out

    async def list_dns(
        self, creds: dict[str, str], domain: str
    ) -> list[DnsRecord]:
        async with self._http(creds) as http:
            zone_id = await self._zone_id(http, domain)
            try:
                resp = await http.get(f"/dns/v1/zones/{zone_id}")
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                self._raise(exc, "Zone")
            except httpx.HTTPError as exc:
                raise RegistrarError(f"IONOS unreachable: {exc}") from exc
            records = resp.json().get("records") or []
            return [
                DnsRecord(
                    id=r.get("id"),
                    name=r.get("name") or "",
                    type=r.get("type") or "",
                    content=r.get("content") or "",
                    ttl=r.get("ttl"),
                    prio=r.get("prio"),
                    disabled=bool(r.get("disabled", False)),
                    root_name=r.get("rootName"),
                    change_date=r.get("changeDate"),
                )
                for r in records
            ]

    async def create_dns(
        self, creds: dict[str, str], domain: str, record: dict[str, Any]
    ) -> None:
        payload = self._clean_record(record)
        async with self._http(creds) as http:
            zone_id = await self._zone_id(http, domain)
            try:
                resp = await http.post(
                    f"/dns/v1/zones/{zone_id}/records", json=[payload]
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                self._raise(exc, "Record")
            except httpx.HTTPError as exc:
                raise RegistrarError(f"IONOS unreachable: {exc}") from exc

    async def update_dns(
        self,
        creds: dict[str, str],
        domain: str,
        record_id: str,
        record: dict[str, Any],
    ) -> None:
        payload = self._clean_record(record)
        async with self._http(creds) as http:
            zone_id = await self._zone_id(http, domain)
            try:
                resp = await http.put(
                    f"/dns/v1/zones/{zone_id}/records/{record_id}", json=payload
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                self._raise(exc, "Record")
            except httpx.HTTPError as exc:
                raise RegistrarError(f"IONOS unreachable: {exc}") from exc

    async def delete_dns(
        self, creds: dict[str, str], domain: str, record_id: str
    ) -> None:
        async with self._http(creds) as http:
            zone_id = await self._zone_id(http, domain)
            try:
                resp = await http.delete(
                    f"/dns/v1/zones/{zone_id}/records/{record_id}"
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                self._raise(exc, "Record")
            except httpx.HTTPError as exc:
                raise RegistrarError(f"IONOS unreachable: {exc}") from exc

    async def list_domains(self, creds: dict[str, str]) -> list[NormalizedDomain]:
        api_key = f"{creds['prefix']}.{creds['secret']}"
        headers = {"X-API-Key": api_key, "Accept": "application/json"}
        async with httpx.AsyncClient(
            base_url=_BASE_URL, headers=headers, timeout=30.0
        ) as http:
            try:
                resp = await http.get("/domains/v1/domainitems")
                resp.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code in (401, 403):
                    raise RegistrarError("Invalid IONOS API key") from exc
                raise RegistrarError(
                    f"IONOS API error {exc.response.status_code}"
                ) from exc
            except httpx.HTTPError as exc:
                raise RegistrarError(f"IONOS unreachable: {exc}") from exc

            payload = resp.json()
            items = payload.get("domains", []) if isinstance(payload, dict) else []
            sem = asyncio.Semaphore(_DETAIL_CONCURRENCY)

            async def _detail(item: dict) -> NormalizedDomain:
                nd = NormalizedDomain(name=item.get("name") or "")
                domain_id = item.get("id")
                if not domain_id:
                    return nd
                async with sem:
                    try:
                        d = await http.get(f"/domains/v1/domainitems/{domain_id}")
                        d.raise_for_status()
                        dj = d.json()
                        nd.expiration_date = dj.get("expirationDate")
                        nd.auto_renew = dj.get("autoRenew")
                        nd.status = dj.get("status") or dj.get("domainType")
                    except httpx.HTTPError as exc:
                        logger.warning(
                            "IONOS detail fetch failed for %s: %s", domain_id, exc
                        )
                return nd

            return list(await asyncio.gather(*(_detail(i) for i in items)))
