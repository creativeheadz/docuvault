import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import System, SystemChatMessage


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


async def get_system(db: AsyncSession, system_id: uuid.UUID) -> System | None:
    return (await db.execute(select(System).where(System.id == system_id))).scalar_one_or_none()


async def list_systems(db: AsyncSession, search: str = "", include_archived: bool = False) -> list[System]:
    q = select(System)
    if not include_archived:
        q = q.where(System.archived_at.is_(None))
    if search:
        like = f"%{search}%"
        q = q.where((System.name.ilike(like)) | (System.short_description.ilike(like)))
    q = q.order_by(System.updated_at.desc())
    return list((await db.execute(q)).scalars().all())


async def apply_partial_update(system: System, patch: dict) -> dict:
    """Apply a partial update from the LLM tool call. Returns the diff that was applied."""
    diff: dict = {}
    allowed = {
        "name", "category", "short_description", "body",
        "tags", "snippets", "palace_drawer_ids", "status", "color", "icon",
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
) -> SystemChatMessage:
    msg = SystemChatMessage(system_id=system_id, role=role, content=content)
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


async def list_chat_messages(db: AsyncSession, system_id: uuid.UUID) -> list[SystemChatMessage]:
    q = (
        select(SystemChatMessage)
        .where(SystemChatMessage.system_id == system_id)
        .order_by(SystemChatMessage.created_at)
    )
    return list((await db.execute(q)).scalars().all())
