"""The read-only surface another product speaks to.

Every route here authenticates with an `ApiToken` through
`app.core.api_auth.require_token` and NOT with `get_current_user`. That is
the whole security design in one sentence: a credential issued for an
integration is not a user, so it cannot reach a route that decrypts a
password, because those routes depend on a user.

The shape is built for a language model rather than a UI. See
`app.services.integration_context` for what an `item` is and why.

Nothing here writes. Write-back (a health score landing on a configuration,
an analysis archived as a document) is a second, separate scope and a second,
separate router, so that an MSP can grant reading without granting writing
and can see which one they granted.
"""
import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_auth import assert_may_read, require_token
from app.core.database import get_db
from app.models.api_token import ApiToken
from app.models.configuration import Configuration
from app.models.organization import Organization
from app.services import integration_context as ctx

router = APIRouter(prefix="/integration", tags=["integration"])

# Bumped when the response shape changes in a way a caller must notice.
# The caller reads it at connect time, so an old Wegweiser talking to a new
# DocuVault can say "this instance speaks a newer dialect" instead of
# rendering half a page of nulls.
API_VERSION = 1


class WhoAmI(BaseModel):
    ok: bool
    api_version: int
    token_name: str
    scopes: list[str]
    organization_scope: int   # 0 = every organisation
    organizations: int
    configurations: int


@router.get("/whoami", response_model=WhoAmI)
async def whoami(token: ApiToken = Depends(require_token),
                 db: AsyncSession = Depends(get_db)):
    """What this key is and what it can see.

    The connect step of the other product's wizard calls exactly this. It
    answers three questions a person actually has: is the key live, which key
    is it (a key pasted from the wrong instance authenticates perfectly
    well), and is there anything in here yet. An integration that connects
    successfully against an empty instance and then produces nothing looks
    broken; the counts make that state legible at setup time.
    """
    org_q = select(func.count()).select_from(Organization).where(
        Organization.archived_at.is_(None))
    cfg_q = select(func.count()).select_from(Configuration).where(
        Configuration.archived_at.is_(None))
    if token.organization_ids:
        org_q = org_q.where(Organization.id.in_(list(token.organization_ids)))
        cfg_q = cfg_q.where(Configuration.organization_id.in_(list(token.organization_ids)))

    return WhoAmI(
        ok=True,
        api_version=API_VERSION,
        token_name=token.name,
        scopes=list(token.scopes or []),
        organization_scope=len(token.organization_ids or []),
        organizations=(await db.execute(org_q)).scalar_one(),
        configurations=(await db.execute(cfg_q)).scalar_one(),
    )


class OrgSummary(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    configurations: int
    path: str


@router.get("/organizations", response_model=list[OrgSummary])
async def list_organizations(token: ApiToken = Depends(require_token),
                             db: AsyncSession = Depends(get_db)):
    """The client list, for the other product's import step.

    Returns everything in one response rather than paginating. An MSP
    documenting more organisations than fit in one JSON body is not a case
    that exists, and the first thing a paginated import endpoint produces is
    a partial import that nobody notices - which is exactly how DocuVault's
    own configuration dedupe created eight duplicate rows against a list
    endpoint that silently stopped at 25.
    """
    q = select(Organization).where(Organization.archived_at.is_(None))
    if token.organization_ids:
        q = q.where(Organization.id.in_(list(token.organization_ids)))
    orgs = (await db.execute(q.order_by(Organization.name))).scalars().all()

    counts = dict((await db.execute(
        select(Configuration.organization_id, func.count())
        .where(Configuration.archived_at.is_(None))
        .group_by(Configuration.organization_id))).all())

    return [OrgSummary(id=o.id, name=o.name, description=o.description,
                       configurations=counts.get(o.id, 0),
                       path=f"/organizations/{o.id}") for o in orgs]


@router.get("/context")
async def get_context(
    organization_id: uuid.UUID = Query(...),
    hostname: str | None = Query(None, max_length=255),
    serial: str | None = Query(None, max_length=255),
    device_name: str | None = Query(None, max_length=255),
    token: ApiToken = Depends(require_token),
    db: AsyncSession = Depends(get_db),
):
    """Documentation for one client, focused on one machine when named.

    The caller passes whatever identity it has for the device. Nothing is
    required beyond the organisation, because a question asked at client
    level ("what is the backup arrangement here") is as real as one asked on
    a machine.
    """
    assert_may_read(token, organization_id)
    return await ctx.organization_context(db, organization_id, hostname=hostname,
                                          serial=serial, device_name=device_name)


@router.get("/search")
async def search(
    q: str = Query(..., min_length=2, max_length=200),
    organization_id: uuid.UUID | None = Query(None),
    token: ApiToken = Depends(require_token),
    db: AsyncSession = Depends(get_db),
):
    """Free-text lookup, so a model can find documentation nobody filed under
    the right client."""
    org_ids = None
    if organization_id is not None:
        assert_may_read(token, organization_id)
        org_ids = [organization_id]
    elif token.organization_ids:
        org_ids = list(token.organization_ids)
    return await ctx.search_context(db, q, organization_ids=org_ids)
