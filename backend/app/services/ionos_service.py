"""IONOS Domains API integration.

Read-only: lists the domains on the IONOS account and enriches each with
its expiration date / auto-renew flag from the per-domain detail endpoint.

Credentials live in `app_settings` under key ``ionos``. The public prefix
is stored as-is (it is not secret); the API secret is encrypted at rest
with the app's Fernet/AES-GCM helper. Results are cached in-process for a
few minutes because a full refresh is ~1 + N HTTP calls (one per domain).

Failures degrade gracefully — the caller surfaces the error string rather
than 500-ing, mirroring the MeshCentral / MemPalace integrations.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt, encrypt
from app.models.app_settings import AppSettings

logger = logging.getLogger(__name__)

IONOS_BASE_URL = "https://api.hosting.ionos.com"
SETTINGS_KEY = "ionos"
_CACHE_TTL_SECONDS = 600  # 10 minutes — domain expiry barely changes
_DETAIL_CONCURRENCY = 6

# Module-level cache: api_key -> (fetched_at_epoch, list[domain dict])
_domains_cache: dict[str, tuple[float, list[dict]]] = {}


# --- Settings persistence ---

async def _load_settings_row(db: AsyncSession) -> AppSettings | None:
    result = await db.execute(
        select(AppSettings).where(AppSettings.key == SETTINGS_KEY)
    )
    return result.scalar_one_or_none()


async def get_settings(db: AsyncSession) -> dict[str, Any]:
    """Return {prefix, secret_set, configured} — never the raw secret."""
    row = await _load_settings_row(db)
    if not row or not row.value:
        return {"prefix": None, "secret_set": False, "configured": False}
    val = row.value
    return {
        "prefix": val.get("prefix"),
        "secret_set": bool(val.get("secret_enc")),
        "configured": bool(val.get("prefix") and val.get("secret_enc")),
    }


async def save_settings(db: AsyncSession, prefix: str, secret: str) -> dict[str, Any]:
    secret_enc = base64.b64encode(encrypt(secret)).decode("ascii")
    value = {"prefix": prefix, "secret_enc": secret_enc}
    row = await _load_settings_row(db)
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=SETTINGS_KEY, value=value))
    await db.flush()
    _domains_cache.clear()  # credentials changed — drop any cached domains
    return {"prefix": prefix, "secret_set": True, "configured": True}


async def _get_api_key(db: AsyncSession) -> str:
    """Resolve the `{prefix}.{secret}` X-API-Key value, or raise."""
    row = await _load_settings_row(db)
    if not row or not row.value:
        raise RuntimeError("IONOS is not configured")
    prefix = row.value.get("prefix")
    secret_enc = row.value.get("secret_enc")
    if not prefix or not secret_enc:
        raise RuntimeError("IONOS is not configured")
    secret = decrypt(base64.b64decode(secret_enc))
    return f"{prefix}.{secret}"


# --- IONOS API calls ---

async def _fetch_domains(api_key: str) -> list[dict]:
    headers = {"X-API-Key": api_key, "Accept": "application/json"}
    async with httpx.AsyncClient(
        base_url=IONOS_BASE_URL, headers=headers, timeout=30.0
    ) as http:
        resp = await http.get("/domains/v1/domainitems")
        resp.raise_for_status()
        payload = resp.json()
        items = payload.get("domains", []) if isinstance(payload, dict) else []

        sem = asyncio.Semaphore(_DETAIL_CONCURRENCY)

        async def _detail(item: dict) -> dict:
            base = {
                "id": item.get("id"),
                "name": item.get("name"),
                "tld": item.get("tld"),
                "expiration_date": None,
                "auto_renew": None,
                "status": None,
            }
            domain_id = item.get("id")
            if not domain_id:
                return base
            async with sem:
                try:
                    d = await http.get(f"/domains/v1/domainitems/{domain_id}")
                    d.raise_for_status()
                    dj = d.json()
                    base["expiration_date"] = dj.get("expirationDate")
                    base["auto_renew"] = dj.get("autoRenew")
                    base["status"] = dj.get("status") or dj.get("domainType")
                except httpx.HTTPError as exc:  # one bad domain shouldn't sink the list
                    logger.warning("IONOS detail fetch failed for %s: %s", domain_id, exc)
            return base

        domains = await asyncio.gather(*(_detail(i) for i in items))

    # soonest expiry first; undated domains sink to the bottom
    domains.sort(key=lambda d: d["expiration_date"] or "9999")
    return domains


async def list_domains(db: AsyncSession, *, force: bool = False) -> list[dict]:
    api_key = await _get_api_key(db)
    now = time.monotonic()
    cached = _domains_cache.get(api_key)
    if not force and cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]
    domains = await _fetch_domains(api_key)
    _domains_cache[api_key] = (now, domains)
    return domains


async def test_connection(db: AsyncSession) -> dict[str, Any]:
    """Verify credentials by listing domains. Never raises — returns a result."""
    try:
        api_key = await _get_api_key(db)
    except RuntimeError as exc:
        return {"success": False, "domain_count": 0, "error": str(exc)}
    try:
        domains = await _fetch_domains(api_key)
        _domains_cache[api_key] = (time.monotonic(), domains)
        return {"success": True, "domain_count": len(domains), "error": None}
    except httpx.HTTPStatusError as exc:
        detail = (
            "Invalid API key (401)"
            if exc.response.status_code == 401
            else f"IONOS API error {exc.response.status_code}"
        )
        return {"success": False, "domain_count": 0, "error": detail}
    except httpx.HTTPError as exc:
        return {"success": False, "domain_count": 0, "error": str(exc)}
