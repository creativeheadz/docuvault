import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.checklist import Checklist
from app.models.configuration import Configuration
from app.models.configuration_baseline import ConfigurationBaseline
from app.models.user import User

router = APIRouter(prefix="/baselines", tags=["baselines"])


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    if month == 12:
        next_month_first = date(year + 1, 1, 1)
    else:
        next_month_first = date(year, month + 1, 1)
    last_day = (next_month_first - timedelta(days=1)).day
    return date(year, month, min(d.day, last_day))


# --- Schemas ---

class BaselineApplyBody(BaseModel):
    checklist_id: uuid.UUID
    review_period_months: int = 6
    last_verified_date: date | None = None


class BaselineVerifyBody(BaseModel):
    verified_on: date | None = None
    notes: str | None = None


class BaselineApplicationResponse(BaseModel):
    id: uuid.UUID
    configuration_id: uuid.UUID
    configuration_name: str
    checklist_id: uuid.UUID
    checklist_name: str
    last_verified_date: date | None
    review_period_months: int
    next_review_date: date
    notes: str | None
    days_until_review: int | None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


def _to_response(item: ConfigurationBaseline) -> BaselineApplicationResponse:
    days = (item.next_review_date - date.today()).days if item.next_review_date else None
    return BaselineApplicationResponse(
        id=item.id,
        configuration_id=item.configuration_id,
        configuration_name=item.configuration.name if item.configuration else "",
        checklist_id=item.checklist_id,
        checklist_name=item.checklist.name if item.checklist else "",
        last_verified_date=item.last_verified_date,
        review_period_months=item.review_period_months,
        next_review_date=item.next_review_date,
        notes=item.notes,
        days_until_review=days,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


# --- Endpoints ---

@router.get("/applications", response_model=list[BaselineApplicationResponse])
async def list_all_applications(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """All baseline applications across the fleet."""
    query = select(ConfigurationBaseline).order_by(ConfigurationBaseline.next_review_date.asc())
    items = (await db.execute(query)).scalars().all()
    return [_to_response(i) for i in items]


@router.get("/stats")
async def baseline_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    base = select(func.count(ConfigurationBaseline.id))
    total = (await db.execute(base)).scalar_one()
    overdue = (await db.execute(base.where(ConfigurationBaseline.next_review_date <= today))).scalar_one()
    baselines_count = (await db.execute(
        select(func.count(Checklist.id)).where(
            Checklist.is_baseline.is_(True), Checklist.archived_at.is_(None)
        )
    )).scalar_one()
    return {"total_applications": total, "overdue": overdue, "baselines": baselines_count}


@router.get("/by-configuration/{configuration_id}", response_model=list[BaselineApplicationResponse])
async def list_baselines_for_configuration(
    configuration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = (
        select(ConfigurationBaseline)
        .where(ConfigurationBaseline.configuration_id == configuration_id)
        .order_by(ConfigurationBaseline.next_review_date.asc())
    )
    items = (await db.execute(query)).scalars().all()
    return [_to_response(i) for i in items]


@router.post("/by-configuration/{configuration_id}", response_model=BaselineApplicationResponse, status_code=status.HTTP_201_CREATED)
async def apply_baseline(
    configuration_id: uuid.UUID,
    body: BaselineApplyBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if body.review_period_months <= 0:
        raise HTTPException(status_code=400, detail="review_period_months must be > 0")
    config = (await db.execute(select(Configuration).where(Configuration.id == configuration_id))).scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    checklist = (await db.execute(select(Checklist).where(Checklist.id == body.checklist_id))).scalar_one_or_none()
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    if not checklist.is_baseline:
        raise HTTPException(status_code=400, detail="Checklist is not marked as a baseline")

    # Unique constraint will reject duplicates with IntegrityError; pre-check for a friendlier error
    existing = (await db.execute(
        select(ConfigurationBaseline).where(
            ConfigurationBaseline.configuration_id == configuration_id,
            ConfigurationBaseline.checklist_id == body.checklist_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Baseline already applied to this configuration")

    anchor = body.last_verified_date or date.today()
    item = ConfigurationBaseline(
        configuration_id=configuration_id,
        checklist_id=body.checklist_id,
        last_verified_date=body.last_verified_date,
        review_period_months=body.review_period_months,
        next_review_date=_add_months(anchor, body.review_period_months),
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


@router.post("/applications/{application_id}/verify", response_model=BaselineApplicationResponse)
async def verify_application(
    application_id: uuid.UUID,
    body: BaselineVerifyBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(ConfigurationBaseline).where(ConfigurationBaseline.id == application_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Baseline application not found")
    verified_on = body.verified_on or date.today()
    item.last_verified_date = verified_on
    item.next_review_date = _add_months(verified_on, item.review_period_months)
    if body.notes:
        item.notes = (item.notes + "\n\n" if item.notes else "") + f"[{verified_on.isoformat()}] {body.notes}"
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


@router.delete("/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_application(
    application_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exists = (await db.execute(select(ConfigurationBaseline.id).where(ConfigurationBaseline.id == application_id))).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Baseline application not found")
    await db.execute(text("DELETE FROM configuration_baselines WHERE id = :aid"), {"aid": application_id})
