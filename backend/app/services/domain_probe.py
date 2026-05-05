"""RDAP probe — fetches registration data for a domain via rdap.org.

rdap.org is a public bootstrap service that knows where each TLD's
authoritative RDAP endpoint lives, so we don't have to maintain that
mapping ourselves. RDAP responds with structured JSON (no parsing of
free-form WHOIS text needed).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

RDAP_BOOTSTRAP = "https://rdap.org/domain/{name}"


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    # RDAP timestamps come as RFC 3339; normalize the trailing Z.
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _registrar_from_entities(entities: list[dict]) -> str | None:
    for ent in entities or []:
        roles = ent.get("roles") or []
        if "registrar" not in roles:
            continue
        # The registrar's name lives in vcardArray, which is a quirky list-of-lists
        # structure: ["vcard", [["fn", {}, "text", "Acme Registrar Inc."], ...]]
        vcard = ent.get("vcardArray") or []
        if len(vcard) >= 2 and isinstance(vcard[1], list):
            for entry in vcard[1]:
                if isinstance(entry, list) and len(entry) >= 4 and entry[0] == "fn":
                    return entry[3]
        # Fallback: handle/identifier field
        if ent.get("handle"):
            return str(ent["handle"])
    return None


async def probe_domain(domain_name: str, timeout: float = 10.0) -> dict[str, Any]:
    """Fetch the RDAP record for `domain_name`. Returns parsed registrar/dates
    plus the full raw response for downstream UI rendering."""
    name = domain_name.strip().lower()
    if not name:
        raise ValueError("empty domain name")

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as http:
        resp = await http.get(RDAP_BOOTSTRAP.format(name=name))
        resp.raise_for_status()
        raw = resp.json()

    # RDAP uses an `events` array with `eventAction` like 'registration', 'expiration', etc.
    events = {ev.get("eventAction"): ev.get("eventDate") for ev in raw.get("events") or []}
    registration_dt = _parse_iso(events.get("registration"))
    expiration_dt = _parse_iso(events.get("expiration"))

    return {
        "domain_name": name,
        "registrar": _registrar_from_entities(raw.get("entities") or []),
        "registration_date": registration_dt.date() if registration_dt else None,
        "expiration_date": expiration_dt.date() if expiration_dt else None,
        "status": raw.get("status") or [],
        "nameservers": [ns.get("ldhName") for ns in raw.get("nameservers") or [] if ns.get("ldhName")],
        "raw": raw,
    }
