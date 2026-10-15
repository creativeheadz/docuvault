import re
import uuid
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.system import System, SystemChatMessage
from app.schemas.system import SystemResponse


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name: str) -> str:
    s = _SLUG_RE.sub("-", name.lower()).strip("-")
    return s or "system"


async def ensure_unique_slug(db: AsyncSession, base: str, exclude_id: uuid.UUID | None = None) -> str:
    candidate = base
    n = 2
    while True:
        q = select(System).where(System.slug == candidate)
        if exclude_id is not None:
            q = q.where(System.id != exclude_id)
        existing = (await db.execute(q)).scalar_one_or_none()
        if not existing:
            return candidate
        candidate = f"{base}-{n}"
        n += 1


async def get_system(db: AsyncSession, system_id: uuid.UUID, *, fresh: bool = False) -> System | None:
    """``fresh`` reloads a system this session already holds, so server-set
    columns and the organisation are readable after a write."""
    q = select(System).where(System.id == system_id)
    if fresh:
        q = q.execution_options(populate_existing=True)
    return (await db.execute(q)).scalar_one_or_none()


async def list_systems(
    db: AsyncSession,
    search: str = "",
    include_archived: bool = False,
    organization_id: uuid.UUID | None = None,
    estate_only: bool = False,
    source: str | None = None,
) -> list[System]:
    """Every system, or one organisation's, or (estate_only) the ones that
    belong to no organisation. Sorted by organisation, then name."""
    q = select(System)
    if not include_archived:
        q = q.where(System.archived_at.is_(None))
    if organization_id is not None:
        q = q.where(System.organization_id == organization_id)
    elif estate_only:
        q = q.where(System.organization_id.is_(None))
    if source:
        # A system belongs to a source it came from, or one that syncs it now.
        linked = {"meshcentral": System.mesh_node_id, "wegweiser": System.wegweiser_device_id}.get(source)
        q = q.where(or_(System.source == source, linked.isnot(None)) if linked is not None else System.source == source)
    if search:
        like = f"%{search}%"
        q = q.where(or_(
            System.name.ilike(like), System.short_description.ilike(like), System.category.ilike(like),
            System.hostname.ilike(like), System.ip_address.ilike(like),
        ))
    q = q.order_by(System.organization_id.is_(None).desc(), System.name)
    return list((await db.execute(q)).scalars().all())


def to_response(system: System) -> SystemResponse:
    resp = SystemResponse.model_validate(system)
    resp.organization_name = system.organization.name if system.organization else None
    return resp


async def check_organization(db: AsyncSession, organization_id: uuid.UUID | None) -> None:
    if organization_id is None:
        return
    if not (await db.execute(select(Organization.id).where(Organization.id == organization_id))).scalar_one_or_none():
        raise ValueError("Organisation not found")


async def fleet_readiness(db: AsyncSession) -> dict[str, int]:
    """Cyber Essentials readiness across in-scope systems."""
    today = date.today()
    base = select(func.count(System.id)).where(System.archived_at.is_(None), System.ce_in_scope.is_(True))
    six_months = date(today.year + (today.month + 6 > 12), ((today.month + 6 - 1) % 12) + 1, min(today.day, 28))

    async def count(*where) -> int:
        return (await db.execute(base.where(*where))).scalar_one()

    return {
        "in_scope": await count(),
        "no_firewall_data": await count(System.software_firewall_on.is_(None)),
        "firewall_off": await count(System.software_firewall_on.is_(False)),
        "no_malware_protection": await count(
            or_(System.malware_protection.is_(None), System.malware_protection == "none")
        ),
        "os_eol_now": await count(System.os_eol_date.isnot(None), System.os_eol_date <= today),
        "os_eol_soon": await count(
            System.os_eol_date.isnot(None), System.os_eol_date > today, System.os_eol_date <= six_months
        ),
        # Not patched this calendar month.
        "patch_stale": await count(
            System.last_patched_date.isnot(None), System.last_patched_date < date(today.year, today.month, 1)
        ),
    }


async def apply_partial_update(system: System, patch: dict) -> dict:
    """Apply a partial update from the LLM tool call. Returns the diff that was applied."""
    diff: dict = {}
    allowed = {
        "name", "category", "short_description", "body",
        "tags", "snippets", "palace_drawer_ids", "status", "color", "icon",
        "hostname", "ip_address", "mac_address", "operating_system", "os_version",
        "manufacturer", "model", "serial_number",
    }
    for k, v in patch.items():
        if k not in allowed or v is None:
            continue
        if k == "snippets" and isinstance(v, dict):
            # Merge instead of replace so the model can add facts incrementally.
            merged = dict(system.snippets or {})
            for sk, sv in v.items():
                if sv is None:
                    merged.pop(sk, None)
                else:
                    merged[sk] = sv
            if merged != (system.snippets or {}):
                system.snippets = merged
                diff[k] = merged
        elif k == "tags" and isinstance(v, list):
            cleaned = sorted({str(t).strip() for t in v if str(t).strip()})
            if cleaned != list(system.tags or []):
                system.tags = cleaned
                diff[k] = cleaned
        elif k == "palace_drawer_ids" and isinstance(v, list):
            cleaned = list({str(t).strip() for t in v if str(t).strip()})
            if cleaned != list(system.palace_drawer_ids or []):
                system.palace_drawer_ids = cleaned
                diff[k] = cleaned
        else:
            if getattr(system, k) != v:
                setattr(system, k, v)
                diff[k] = v
    return diff


async def append_chat_message(
    db: AsyncSession,
    system_id: uuid.UUID,
    role: str,
    content: list,
    usage: dict | None = None,
) -> SystemChatMessage:
    msg = SystemChatMessage(
        system_id=system_id,
        role=role,
        content=content,
        usage=usage,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


async def list_chat_messages(db: AsyncSession, system_id: uuid.UUID) -> list[SystemChatMessage]:
    q = (
        select(SystemChatMessage)
        .where(SystemChatMessage.system_id == system_id)
        .order_by(SystemChatMessage.seq)
    )
    return list((await db.execute(q)).scalars().all())
