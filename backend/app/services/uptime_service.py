"""Uptime Kuma integration: reads the Prometheus ``/metrics`` endpoint with
an API key and exposes a live, point-in-time snapshot of every monitor.

Settings live in a single ``app_settings`` row keyed ``uptime_kuma``::

    {"url": "https://uptime.example.com", "api_key": "<base64 ciphertext>"}

The API key is AES-GCM encrypted via :mod:`app.core.encryption` before
storage (mirrors registrar credential handling). Kuma's metrics endpoint
authenticates with HTTP Basic auth: empty username, API key as password.

Note: ``/metrics`` is a *snapshot* — current status, response time and
cert expiry per monitor. It carries no uptime %/SLA or heartbeat history
(those need the Socket.IO API + username/password). Paused monitors emit
no metrics and therefore don't appear here.
"""

from __future__ import annotations

import base64
import logging
import re
import time
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt, encrypt
from app.models.app_settings import AppSettings

logger = logging.getLogger(__name__)

SETTINGS_KEY = "uptime_kuma"
_CACHE_TTL_SECONDS = 60
_TIMEOUT = 10.0

# Prometheus metric name -> field we surface
_METRIC_FIELDS = {
    "monitor_status": "status",
    "monitor_response_time": "response_time",
    "monitor_cert_days_remaining": "cert_days_remaining",
    "monitor_cert_is_valid": "cert_is_valid",
}
_STATUS_LABELS = {0: "down", 1: "up", 2: "pending", 3: "maintenance"}

# single Kuma instance -> one cached snapshot, keyed by url
_cache: dict[str, tuple[float, dict[str, Any]]] = {}

_LINE_RE = re.compile(r"^(\w+)\{(.*)\}\s+([0-9eE.+-]+|NaN|[+-]?Inf)\s*$")
_LABEL_RE = re.compile(r'(\w+)="((?:[^"\\]|\\.)*)"')


# --- Persistence ---

async def _row(db: AsyncSession) -> AppSettings | None:
    result = await db.execute(select(AppSettings).where(AppSettings.key == SETTINGS_KEY))
    return result.scalar_one_or_none()


def _public(url: str | None, has_key: bool) -> dict[str, Any]:
    return {
        "url": url or None,
        "api_key_set": has_key,
        "configured": bool(url and has_key),
    }


async def get_settings(db: AsyncSession) -> dict[str, Any]:
    """Public settings view — never returns the key itself."""
    row = await _row(db)
    val = row.value if row and row.value else {}
    return _public((val.get("url") or "").strip() or None, bool(val.get("api_key")))


async def save_settings(db: AsyncSession, url: str, api_key: str) -> dict[str, Any]:
    url = (url or "").strip().rstrip("/")
    api_key = (api_key or "").strip()
    row = await _row(db)
    existing = dict(row.value) if row and row.value else {}

    value: dict[str, str] = {"url": url}
    if api_key:
        value["api_key"] = base64.b64encode(encrypt(api_key)).decode("ascii")
    elif existing.get("api_key"):
        # URL-only edit — keep the stored (encrypted) key
        value["api_key"] = existing["api_key"]

    if row:
        row.value = value
    else:
        db.add(AppSettings(key=SETTINGS_KEY, value=value))
    await db.flush()
    _cache.clear()
    return _public(url or None, bool(value.get("api_key")))


async def _resolve(db: AsyncSession) -> tuple[str, str] | None:
    row = await _row(db)
    if not row or not row.value:
        return None
    url = (row.value.get("url") or "").strip().rstrip("/")
    enc = row.value.get("api_key")
    if not url or not enc:
        return None
    try:
        return url, decrypt(base64.b64decode(enc))
    except Exception:  # noqa: BLE001 — corrupt/rotated key -> treat as unset
        logger.warning("Failed to decrypt Uptime Kuma API key")
        return None


# --- Metrics parsing ---

def _nullable(v: str | None) -> str | None:
    return None if v in (None, "", "null") else v


def _to_int(v: Any) -> int | None:
    try:
        return int(v) if v is not None else None
    except (ValueError, OverflowError):
        return None


def _parse_metrics(text: str) -> list[dict[str, Any]]:
    monitors: dict[str, dict[str, Any]] = {}
    for line in text.splitlines():
        if not line or line[0] == "#":
            continue
        m = _LINE_RE.match(line)
        if not m:
            continue
        metric, label_blob, raw_value = m.groups()
        field = _METRIC_FIELDS.get(metric)
        if field is None:
            continue
        labels = dict(_LABEL_RE.findall(label_blob))
        mid = labels.get("monitor_id")
        if mid is None:
            continue
        mon = monitors.setdefault(
            mid,
            {
                "id": mid,
                "name": labels.get("monitor_name"),
                "type": labels.get("monitor_type"),
                "url": _nullable(labels.get("monitor_url")),
                "hostname": _nullable(labels.get("monitor_hostname")),
                "port": _nullable(labels.get("monitor_port")),
            },
        )
        try:
            mon[field] = float(raw_value)
        except ValueError:
            continue

    out: list[dict[str, Any]] = []
    for mon in monitors.values():
        status = _to_int(mon.get("status"))
        out.append(
            {
                "id": mon["id"],
                "name": mon.get("name") or f"monitor {mon['id']}",
                "type": mon.get("type"),
                "url": mon.get("url"),
                "hostname": mon.get("hostname"),
                "port": mon.get("port"),
                "status": status,
                "status_label": _STATUS_LABELS.get(status, "unknown"),
                "response_time": _to_int(mon.get("response_time")),
                "cert_days_remaining": _to_int(mon.get("cert_days_remaining")),
                "cert_is_valid": bool(mon["cert_is_valid"]) if "cert_is_valid" in mon else None,
            }
        )
    # surface problems first: down(0) < pending(2)/maintenance(3) < up(1), then by name
    _order = {0: 0, 2: 1, 3: 2, 1: 3}
    out.sort(key=lambda x: (_order.get(x["status"], 4), x["name"].lower()))
    return out


def _summary(monitors: list[dict[str, Any]]) -> dict[str, int]:
    s = {"total": len(monitors), "up": 0, "down": 0, "pending": 0, "maintenance": 0}
    for mon in monitors:
        if mon["status_label"] in s:
            s[mon["status_label"]] += 1
    return s


# --- Public API ---

async def fetch_monitors(db: AsyncSession, *, force: bool = False) -> dict[str, Any]:
    resolved = await _resolve(db)
    if resolved is None:
        return {"configured": False, "monitors": [], "summary": _summary([]), "error": None}
    url, api_key = resolved

    now = time.monotonic()
    cached = _cache.get(url)
    if not force and cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    def _err(msg: str) -> dict[str, Any]:
        return {"configured": True, "monitors": [], "summary": _summary([]), "error": msg}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as cx:
            resp = await cx.get(f"{url}/metrics", auth=("", api_key))
        if resp.status_code in (401, 403):
            return _err("Authentication failed — check the API key.")
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Uptime Kuma fetch failed: %s", exc)
        return _err(f"Could not reach Uptime Kuma: {exc}")

    monitors = _parse_metrics(resp.text)
    result = {
        "configured": True,
        "monitors": monitors,
        "summary": _summary(monitors),
        "error": None,
    }
    _cache[url] = (now, result)
    return result


async def test(db: AsyncSession) -> dict[str, Any]:
    result = await fetch_monitors(db, force=True)
    if not result["configured"]:
        return {"success": False, "monitor_count": 0, "error": "Not configured"}
    if result["error"]:
        return {"success": False, "monitor_count": 0, "error": result["error"]}
    return {"success": True, "monitor_count": result["summary"]["total"], "error": None}
