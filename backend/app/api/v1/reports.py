from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.organization import Organization
from app.models.configuration import Configuration
from app.models.password import Password
from app.models.document import Document
from app.models.domain import Domain
from app.models.contact import Contact
from app.models.location import Location
from app.models.ssl_certificate import SSLCertificate
from app.models.checklist import Checklist
from app.models.runbook import Runbook
from app.models.audit_log import AuditLog
from app.models.user import User

router = APIRouter(prefix="/reports", tags=["reports"])


class EntityCount(BaseModel):
    entity_type: str
    count: int


class CoverageReport(BaseModel):
    counts: list[EntityCount]
    total: int


class ActivityEntry(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    action: str
    created_at: str | None = None

    model_config = {"from_attributes": True}


class ActivityReport(BaseModel):
    entries: list[ActivityEntry]
    total: int


@router.get("/coverage", response_model=CoverageReport)
async def coverage_report(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    entity_models = [
        ("organizations", Organization),
        ("configurations", Configuration),
        ("passwords", Password),
        ("documents", Document),
        ("domains", Domain),
        ("contacts", Contact),
        ("locations", Location),
        ("ssl_certificates", SSLCertificate),
        ("checklists", Checklist),
        ("runbooks", Runbook),
    ]

    counts = []
    total = 0
    for name, model in entity_models:
        result = await db.execute(select(func.count()).select_from(model))
        count = result.scalar() or 0
        counts.append(EntityCount(entity_type=name, count=count))
        total += count

    return CoverageReport(counts=counts, total=total)


@router.get("/activity", response_model=ActivityReport)
async def activity_report(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    entries_raw = result.scalars().all()

    entries = [
        ActivityEntry(
            id=str(e.id),
            entity_type=e.entity_type,
            entity_id=str(e.entity_id),
            action=e.action,
            created_at=e.created_at.isoformat() if e.created_at else None,
        )
        for e in entries_raw
    ]

    count_result = await db.execute(select(func.count()).select_from(AuditLog))
    total = count_result.scalar() or 0

    return ActivityReport(entries=entries, total=total)
