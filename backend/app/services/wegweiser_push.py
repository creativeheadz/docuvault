"""Machines pushed in by Wegweiser, upserted as systems.

Wegweiser's agents see every machine on a client's network; DocuVault's
network maps only offer what is a system here. This is the bridge.

Most of those machines are already here, imported from MeshCentral, so the
work is matching rather than inserting. A device is linked once, by
Wegweiser's `deviceuuid`, and found again by that on every later push.
Before it is linked it is looked for among the systems of the organisations
it may land in, by what identifies hardware, strongest first: a burned-in
MAC, then the firmware serial, then the hostname in its short form. IP is
never used: a MeshCentral row carries the site's NAT address.

Who owns the inventory fields decides who may overwrite them. A system that
MeshCentral syncs keeps MeshCentral's values; Wegweiser only fills what is
blank, or the two syncs would rewrite each other's OS string every night.
A system Wegweiser brought in, or one nobody syncs, takes Wegweiser's values.
Name, category and the written documentation are never touched after a
system exists: those are the operator's.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_token import ApiToken
from app.models.organization import Organization
from app.models.system import System
from app.schemas.inventory import PushedDevice, PushResult, SkippedDevice
from app.services import system_service

INVENTORY_FIELDS = (
    "hostname", "ip_address", "mac_address", "operating_system", "os_version",
    "manufacturer", "model", "serial_number",
)

# Firmware fills these in when the vendor did not; matching on them would
# make every unbranded box the same machine.
_PLACEHOLDER_SERIALS = {
    "", "0", "00000000", "none", "n/a", "na", "null", "unknown", "default string",
    "to be filled by o.e.m.", "system serial number", "chassis serial number",
    "not specified", "not applicable", "123456789",
}
_HEX = re.compile(r"[^0-9A-F]")


def mac_key(mac: str | None) -> str | None:
    """Twelve upper-case hex digits, or None for anything that is not a MAC."""
    if not mac:
        return None
    digits = _HEX.sub("", mac.upper())
    if len(digits) != 12 or digits in ("000000000000", "FFFFFFFFFFFF"):
        return None
    return digits


def mac_display(key: str) -> str:
    return ":".join(key[i:i + 2] for i in range(0, 12, 2))


def serial_key(serial: str | None) -> str | None:
    s = (serial or "").strip().lower()
    return None if s in _PLACEHOLDER_SERIALS else s


def hostname_key(name: str | None) -> str | None:
    """Lower case, and only the part before the first dot: MeshCentral holds
    `workstation-04`, the agent reports `workstation-04.clients.local`."""
    n = (name or "").strip().lower()
    return n.split(".")[0] or None


def best_match(candidates: Iterable[System], device: PushedDevice) -> System | None:
    """The system already here that is this device, or None.

    Candidates are systems not yet linked to any Wegweiser device. Each rule
    is tried across every candidate before the next, weaker one is.
    """
    candidates = list(candidates)
    macs = {k for k in (mac_key(m) for m in device.mac_addresses) if k}
    if macs:
        for c in candidates:
            if mac_key(c.mac_address) in macs:
                return c
    serial = serial_key(device.serial_number)
    if serial:
        for c in candidates:
            if serial_key(c.serial_number) == serial:
                return c
    names = {k for k in (hostname_key(device.hostname), hostname_key(device.name)) if k}
    if names:
        for c in candidates:
            if hostname_key(c.hostname) in names or hostname_key(c.name) in names:
                return c
    return None


def apply_device(system: System, device: PushedDevice, now: datetime) -> None:
    """What Wegweiser says about a machine, written onto its system."""
    owner = system.mesh_node_id is None
    macs = [k for k in (mac_key(m) for m in device.mac_addresses) if k]
    values = {
        "hostname": device.hostname,
        "ip_address": device.ip_address,
        "mac_address": mac_display(macs[0]) if macs else None,
        "operating_system": device.operating_system,
        "os_version": device.os_version,
        "manufacturer": device.manufacturer,
        "model": device.model,
        "serial_number": device.serial_number if serial_key(device.serial_number) else None,
    }
    for field, value in values.items():
        value = (value or "").strip() or None
        if value is None:
            continue
        if owner or not getattr(system, field):
            setattr(system, field, value)

    system.wegweiser_device_id = device.external_id
    system.wegweiser_online = device.online
    system.wegweiser_last_seen_at = device.last_seen_at
    system.wegweiser_synced_at = now
    system.wegweiser_extra = {
        k: v for k, v in {
            "health_score": device.health_score,
            "agent_version": device.agent_version,
            "group": device.group,
            "url": device.url,
            "mac_addresses": [mac_display(m) for m in macs] or None,
            "system_uuid": device.system_uuid,
        }.items() if v is not None
    }


async def push(db: AsyncSession, token: ApiToken, devices: list[PushedDevice]) -> PushResult:
    result = PushResult(received=len(devices))
    now = datetime.now(timezone.utc)

    wanted_orgs = {o for d in devices for o in d.organization_ids}
    existing_orgs = set((await db.execute(
        select(Organization.id).where(Organization.id.in_(wanted_orgs))
    )).scalars().all()) if wanted_orgs else set()

    linked = {
        s.wegweiser_device_id: s for s in (await db.execute(
            select(System).where(System.wegweiser_device_id.in_([d.external_id for d in devices]))
        )).scalars().all()
    }
    # Unlinked systems per organisation, loaded once and shared by every
    # device that may land there. A system linked during this push leaves
    # the pool, so two devices can never claim the same record.
    pools: dict[uuid.UUID, list[System]] = {}

    async def pool(org_id: uuid.UUID) -> list[System]:
        if org_id not in pools:
            pools[org_id] = list((await db.execute(select(System).where(
                System.organization_id == org_id,
                System.wegweiser_device_id.is_(None),
                System.archived_at.is_(None),
            ))).scalars().all())
        return pools[org_id]

    seen: set[str] = set()
    for device in devices:
        if device.external_id in seen:
            result.skipped.append(SkippedDevice(external_id=device.external_id, reason="sent twice in one push"))
            continue
        seen.add(device.external_id)
        orgs = [o for o in device.organization_ids if o in existing_orgs and token.allows_organization(o)]
        if not orgs:
            result.skipped.append(SkippedDevice(
                external_id=device.external_id,
                reason="none of its organisations exists here or may be written with this key",
            ))
            continue

        system = linked.get(device.external_id)
        if system is not None:
            if system.organization_id is not None and not token.allows_organization(system.organization_id):
                result.skipped.append(SkippedDevice(
                    external_id=device.external_id,
                    reason="already linked to a system in an organisation this key may not write",
                ))
                continue
            apply_device(system, device, now)
            result.updated += 1
            continue

        candidates = [c for org in orgs for c in await pool(org)]
        system = best_match(candidates, device)
        if system is not None:
            pools[system.organization_id].remove(system)
            apply_device(system, device, now)
            result.linked += 1
            continue

        system = System(
            organization_id=orgs[0],
            name=device.name.strip(),
            slug=await system_service.ensure_unique_slug(db, system_service.slugify(device.name)),
            category=(device.category or "").strip() or None,
            source="wegweiser",
            status="active",
            ce_in_scope=True,
        )
        apply_device(system, device, now)
        db.add(system)
        await db.flush()
        result.created += 1

    await db.flush()
    return result
