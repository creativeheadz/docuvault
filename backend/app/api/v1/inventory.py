"""Machines pushed in by another product, as systems.

Authenticates with an `ApiToken` carrying `write:systems` and nothing else
accepted here. It is the only route that writes systems with a key, and it
writes nothing but systems: no organisation is created from a push, and the
written documentation on a system is never touched. See
`app.services.wegweiser_push` for how a device finds its system.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_auth import require_scope
from app.core.database import get_db
from app.models.api_token import SCOPE_WRITE_SYSTEMS, ApiToken
from app.models.organization import Organization
from app.schemas.inventory import InventoryPush, PushResult
from app.services import wegweiser_push

router = APIRouter(prefix="/inventory", tags=["inventory"])

require_write_systems = require_scope(SCOPE_WRITE_SYSTEMS)


class PushWhoAmI(BaseModel):
    ok: bool
    token_name: str
    scopes: list[str]
    organization_scope: int   # 0 = every organisation
    organizations: int


@router.get("/whoami", response_model=PushWhoAmI)
async def whoami(
    token: ApiToken = Depends(require_write_systems),
    db: AsyncSession = Depends(get_db),
):
    """What this key is, for the pushing product's connect step.

    `/integration/whoami` answers only a reading key, and a pushing key must
    not be one; this answers the same questions for a key that can only push.
    """
    q = select(func.count()).select_from(Organization).where(Organization.archived_at.is_(None))
    if token.organization_ids:
        q = q.where(Organization.id.in_(list(token.organization_ids)))
    return PushWhoAmI(
        ok=True,
        token_name=token.name,
        scopes=list(token.scopes or []),
        organization_scope=len(token.organization_ids or []),
        organizations=(await db.execute(q)).scalar_one(),
    )


@router.put("/wegweiser", response_model=PushResult)
async def push_wegweiser_devices(
    body: InventoryPush,
    token: ApiToken = Depends(require_write_systems),
    db: AsyncSession = Depends(get_db),
):
    """Upsert every device in the batch. Idempotent: sending the same batch
    twice links and updates, it never adds a second system for a machine."""
    return await wegweiser_push.push(db, token, body.devices)
