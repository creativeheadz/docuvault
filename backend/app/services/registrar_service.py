"""Orchestrates registrar providers: per-provider encrypted credential
storage, connection tests, and an aggregated, cached domain list.

All providers' credentials live in a single `app_settings` row keyed
``registrars``::

    { "<provider_key>": { "<field>": "<plain or base64-ciphertext>" } }

Secret fields (per `provider.secret_field_names()`) are encrypted with
the app AES-GCM helper before storage. A one-time read-side migration
folds the legacy standalone ``ionos`` settings row into this structure.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt, encrypt
from app.models.app_settings import AppSettings
from app.services.registrars import REGISTRY, RegistrarError

logger = logging.getLogger(__name__)

SETTINGS_KEY = "registrars"
_CACHE_TTL_SECONDS = 600
# (provider_key, creds_hash) -> (fetched_at_monotonic, list[normalized dict])
_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}


# --- Persistence ---

async def _row(db: AsyncSession, key: str) -> AppSettings | None:
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    return result.scalar_one_or_none()


async def _load_store(db: AsyncSession) -> dict[str, dict[str, str]]:
    row = await _row(db, SETTINGS_KEY)
    store: dict[str, dict[str, str]] = dict(row.value) if row and row.value else {}

    # Legacy migration: old standalone "ionos" row -> registrars.ionos
    if "ionos" not in store:
        legacy = await _row(db, "ionos")
        if legacy and legacy.value and legacy.value.get("secret_enc"):
            store["ionos"] = {
                "prefix": legacy.value.get("prefix", ""),
                # already-encrypted; stored ciphertext is reused as-is
                "secret": legacy.value["secret_enc"],
            }
    return store


async def _save_store(db: AsyncSession, store: dict[str, dict[str, str]]) -> None:
    row = await _row(db, SETTINGS_KEY)
    if row:
        row.value = store
    else:
        db.add(AppSettings(key=SETTINGS_KEY, value=store))
    await db.flush()


# --- Credential (de)serialisation ---

def _encrypt_secrets(provider_key: str, values: dict[str, str]) -> dict[str, str]:
    provider = REGISTRY[provider_key]
    secrets = set(provider.secret_field_names())
    out: dict[str, str] = {}
    for name, val in values.items():
        if val is None:
            continue
        if name in secrets and val != "":
            out[name] = base64.b64encode(encrypt(val)).decode("ascii")
        else:
            out[name] = val
    return out


def _decrypt_secrets(provider_key: str, stored: dict[str, str]) -> dict[str, str]:
    provider = REGISTRY[provider_key]
    secrets = set(provider.secret_field_names())
    out: dict[str, str] = {}
    for name, val in stored.items():
        if name in secrets and val:
            try:
                out[name] = decrypt(base64.b64decode(val))
            except Exception:  # noqa: BLE001 — corrupt/rotated key -> treat as unset
                logger.warning("Failed to decrypt %s.%s", provider_key, name)
                out[name] = ""
        else:
            out[name] = val
    return out


def _is_configured(provider_key: str, stored: dict[str, str]) -> bool:
    provider = REGISTRY[provider_key]
    return all(stored.get(n) for n in provider.required_field_names())


# --- Public API ---

async def get_status(db: AsyncSession) -> list[dict[str, Any]]:
    """Provider metadata + which fields are set. Never returns secrets."""
    store = await _load_store(db)
    out: list[dict[str, Any]] = []
    for key, provider in REGISTRY.items():
        stored = store.get(key, {})
        out.append(
            {
                "key": key,
                "label": provider.label,
                "fields": provider.fields_meta(),
                "set_fields": [n for n, v in stored.items() if v],
                "configured": _is_configured(key, stored),
                "supports_dns": provider.supports_dns,
            }
        )
    return out


async def save(
    db: AsyncSession, provider_key: str, values: dict[str, str]
) -> dict[str, Any]:
    if provider_key not in REGISTRY:
        raise RegistrarError(f"Unknown registrar '{provider_key}'")
    provider = REGISTRY[provider_key]
    cleaned = {k: (v or "").strip() for k, v in values.items()}
    missing = [n for n in provider.required_field_names() if not cleaned.get(n)]
    if missing:
        raise RegistrarError(f"Missing required field(s): {', '.join(missing)}")

    store = await _load_store(db)
    store[provider_key] = _encrypt_secrets(provider_key, cleaned)
    await _save_store(db, store)
    _cache.clear()  # credentials changed — drop cached domains
    return {
        "key": provider_key,
        "label": provider.label,
        "configured": _is_configured(provider_key, store[provider_key]),
    }


async def _resolve_creds(
    db: AsyncSession, provider_key: str
) -> dict[str, str] | None:
    store = await _load_store(db)
    stored = store.get(provider_key)
    if not stored or not _is_configured(provider_key, stored):
        return None
    return _decrypt_secrets(provider_key, stored)


async def test(db: AsyncSession, provider_key: str) -> dict[str, Any]:
    if provider_key not in REGISTRY:
        return {"success": False, "domain_count": 0, "error": "Unknown registrar"}
    creds = await _resolve_creds(db, provider_key)
    if creds is None:
        return {"success": False, "domain_count": 0, "error": "Not configured"}
    provider = REGISTRY[provider_key]
    try:
        domains = await provider.list_domains(creds)
    except RegistrarError as exc:
        return {"success": False, "domain_count": 0, "error": str(exc)}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Registrar test failed for %s", provider_key)
        return {"success": False, "domain_count": 0, "error": str(exc)}
    _cache[(provider_key, _creds_hash(creds))] = (
        time.monotonic(),
        [d.as_dict() for d in domains],
    )
    return {"success": True, "domain_count": len(domains), "error": None}


def _creds_hash(creds: dict[str, str]) -> str:
    raw = "|".join(f"{k}={creds[k]}" for k in sorted(creds))
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


async def list_all(db: AsyncSession, *, force: bool = False) -> dict[str, Any]:
    """Aggregate domains across every configured provider. Per-provider
    failures are reported in `errors` rather than sinking the whole list."""
    store = await _load_store(db)
    domains: list[dict[str, Any]] = []
    errors: dict[str, str] = {}
    configured: list[str] = []

    for key, provider in REGISTRY.items():
        stored = store.get(key, {})
        if not _is_configured(key, stored):
            continue
        configured.append(key)
        creds = _decrypt_secrets(key, stored)
        ckey = (key, _creds_hash(creds))
        now = time.monotonic()
        cached = _cache.get(ckey)
        if not force and cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
            rows = cached[1]
        else:
            try:
                fetched = await provider.list_domains(creds)
            except RegistrarError as exc:
                errors[key] = str(exc)
                continue
            except Exception as exc:  # noqa: BLE001
                logger.exception("Registrar list failed for %s", key)
                errors[key] = str(exc)
                continue
            rows = [d.as_dict() for d in fetched]
            _cache[ckey] = (now, rows)
        for r in rows:
            domains.append(
                {
                    **r,
                    "provider": key,
                    "provider_label": provider.label,
                    "supports_dns": provider.supports_dns,
                }
            )

    domains.sort(key=lambda d: d.get("expiration_date") or "9999")
    return {"domains": domains, "errors": errors, "configured": configured}


# --- DNS (only for providers with supports_dns) ---

async def _dns_provider_and_creds(db: AsyncSession, provider_key: str):
    if provider_key not in REGISTRY:
        raise RegistrarError("Unknown registrar")
    provider = REGISTRY[provider_key]
    if not provider.supports_dns:
        raise RegistrarError(f"{provider.label} does not expose DNS")
    creds = await _resolve_creds(db, provider_key)
    if creds is None:
        raise RegistrarError(f"{provider.label} is not configured")
    return provider, creds


async def list_dns(
    db: AsyncSession, provider_key: str, domain: str
) -> list[dict[str, Any]]:
    provider, creds = await _dns_provider_and_creds(db, provider_key)
    records = await provider.list_dns(creds, domain)
    return [r.as_dict() for r in records]


async def create_dns(
    db: AsyncSession, provider_key: str, domain: str, record: dict[str, Any]
) -> None:
    provider, creds = await _dns_provider_and_creds(db, provider_key)
    await provider.create_dns(creds, domain, record)


async def update_dns(
    db: AsyncSession,
    provider_key: str,
    domain: str,
    record_id: str,
    record: dict[str, Any],
) -> None:
    provider, creds = await _dns_provider_and_creds(db, provider_key)
    await provider.update_dns(creds, domain, record_id, record)


async def delete_dns(
    db: AsyncSession, provider_key: str, domain: str, record_id: str
) -> None:
    provider, creds = await _dns_provider_and_creds(db, provider_key)
    await provider.delete_dns(creds, domain, record_id)
