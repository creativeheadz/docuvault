import csv
import io
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.cloud_service import CloudService
from app.models.user import User

router = APIRouter(prefix="/cloud-services", tags=["cloud-services"])


VALID_TYPES = {"IaaS", "PaaS", "SaaS"}
VALID_CLASSIFICATIONS = {"none", "public", "internal", "confidential", "personal"}
VALID_STATUSES = {"active", "pending", "retired"}


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

class CloudServiceCreate(BaseModel):
    name: str = Field(..., max_length=200)
    vendor: str = Field(..., max_length=200)
    service_type: str = "SaaS"
    url: str | None = None
    business_purpose: str
    data_classification: str = "internal"
    organization_id: uuid.UUID | None = None

    admin_count: int = 1
    user_count: int | None = None
    mfa_enforced: bool = False
    sso_enabled: bool = False

    billing_owner: str | None = None
    monthly_cost_gbp: int | None = None  # pence

    ce_in_scope: bool = True
    last_reviewed_date: date | None = None
    review_period_months: int = 12
    next_review_date: date | None = None

    status: str = "active"
    notes: str | None = None


class CloudServiceUpdate(BaseModel):
    name: str | None = None
    vendor: str | None = None
    service_type: str | None = None
    url: str | None = None
    business_purpose: str | None = None
    data_classification: str | None = None
    organization_id: uuid.UUID | None = None

    admin_count: int | None = None
    user_count: int | None = None
    mfa_enforced: bool | None = None
    sso_enabled: bool | None = None

    billing_owner: str | None = None
    monthly_cost_gbp: int | None = None

    ce_in_scope: bool | None = None
    last_reviewed_date: date | None = None
    review_period_months: int | None = None
    next_review_date: date | None = None

    status: str | None = None
    notes: str | None = None


class CloudServiceResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    name: str
    vendor: str
    service_type: str
    url: str | None
    business_purpose: str
    data_classification: str

    admin_count: int
    user_count: int | None
    mfa_enforced: bool
    sso_enabled: bool

    billing_owner: str | None
    monthly_cost_gbp: int | None

    ce_in_scope: bool
    last_reviewed_date: date | None
    review_period_months: int
    next_review_date: date

    status: str
    notes: str | None
    archived_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    organization_name: str | None = None
    days_until_review: int | None = None

    model_config = {"from_attributes": True}


def _validate_enum(value: str, allowed: set[str], field: str) -> None:
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid {field}. Must be one of: {sorted(allowed)}")


def _to_response(item: CloudService) -> CloudServiceResponse:
    resp = CloudServiceResponse.model_validate(item)
    resp.organization_name = item.organization.name if item.organization else None
    if item.status == "active":
        resp.days_until_review = (item.next_review_date - date.today()).days
    else:
        resp.days_until_review = None
    return resp


# --- Endpoints ---

@router.get("", response_model=list[CloudServiceResponse])
async def list_cloud_services(
    organization_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    include_archived: bool = Query(False),
    overdue_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(CloudService)
    if not include_archived:
        query = query.where(CloudService.archived_at.is_(None))
    if organization_id is not None:
        query = query.where(CloudService.organization_id == organization_id)
    if status_filter:
        query = query.where(CloudService.status == status_filter)
    if overdue_only:
        query = query.where(
            CloudService.status == "active",
            CloudService.next_review_date <= date.today(),
        )
    query = query.order_by(CloudService.next_review_date.asc(), CloudService.name.asc())
    items = (await db.execute(query)).scalars().all()
    return [_to_response(s) for s in items]


@router.get("/stats")
async def cloud_services_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    soon = today + timedelta(days=30)
    base = select(func.count(CloudService.id)).where(CloudService.archived_at.is_(None))
    total = (await db.execute(base)).scalar_one()
    active = (await db.execute(base.where(CloudService.status == "active"))).scalar_one()
    no_mfa = (await db.execute(
        base.where(CloudService.status == "active", CloudService.mfa_enforced.is_(False))
    )).scalar_one()
    overdue = (await db.execute(
        base.where(CloudService.status == "active", CloudService.next_review_date <= today)
    )).scalar_one()
    due_soon = (await db.execute(
        base.where(
            CloudService.status == "active",
            CloudService.next_review_date > today,
            CloudService.next_review_date <= soon,
        )
    )).scalar_one()
    monthly_cost_pence = (await db.execute(
        select(func.coalesce(func.sum(CloudService.monthly_cost_gbp), 0))
        .where(CloudService.archived_at.is_(None), CloudService.status == "active")
    )).scalar_one()
    return {
        "total": total,
        "active": active,
        "no_mfa": no_mfa,
        "overdue": overdue,
        "due_soon": due_soon,
        "monthly_cost_pence": monthly_cost_pence,
    }


@router.get("/export.csv")
async def export_cloud_services_csv(
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(CloudService)
    if not include_archived:
        query = query.where(CloudService.archived_at.is_(None))
    query = query.order_by(CloudService.name.asc())
    items = (await db.execute(query)).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Name", "Vendor", "Type", "URL", "Business purpose",
        "Data classification", "CE in scope",
        "Admins", "Users", "MFA enforced", "SSO enabled",
        "Billing owner", "Monthly cost (£)",
        "Last reviewed", "Next review", "Review (months)",
        "Status", "Organization", "Notes",
    ])
    for s in items:
        writer.writerow([
            s.name, s.vendor, s.service_type, s.url or "", s.business_purpose,
            s.data_classification, "yes" if s.ce_in_scope else "no",
            s.admin_count, s.user_count or "",
            "yes" if s.mfa_enforced else "no",
            "yes" if s.sso_enabled else "no",
            s.billing_owner or "",
            f"{(s.monthly_cost_gbp or 0) / 100:.2f}" if s.monthly_cost_gbp else "",
            s.last_reviewed_date.isoformat() if s.last_reviewed_date else "",
            s.next_review_date.isoformat(),
            s.review_period_months,
            s.status,
            s.organization.name if s.organization else "",
            s.notes or "",
        ])
    buf.seek(0)
    filename = f"cloud-services-register-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=CloudServiceResponse, status_code=status.HTTP_201_CREATED)
async def create_cloud_service(
    body: CloudServiceCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _validate_enum(body.service_type, VALID_TYPES, "service_type")
    _validate_enum(body.data_classification, VALID_CLASSIFICATIONS, "data_classification")
    _validate_enum(body.status, VALID_STATUSES, "status")
    if body.review_period_months <= 0:
        raise HTTPException(status_code=400, detail="review_period_months must be > 0")

    data = body.model_dump()
    if data.get("next_review_date") is None:
        anchor = body.last_reviewed_date or date.today()
        data["next_review_date"] = _add_months(anchor, body.review_period_months)

    item = CloudService(**data)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


@router.get("/{service_id}", response_model=CloudServiceResponse)
async def get_cloud_service(
    service_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(CloudService).where(CloudService.id == service_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cloud service not found")
    return _to_response(item)


@router.put("/{service_id}", response_model=CloudServiceResponse)
async def update_cloud_service(
    service_id: uuid.UUID,
    body: CloudServiceUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(CloudService).where(CloudService.id == service_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cloud service not found")

    updates = body.model_dump(exclude_unset=True)
    if "service_type" in updates and updates["service_type"] is not None:
        _validate_enum(updates["service_type"], VALID_TYPES, "service_type")
    if "data_classification" in updates and updates["data_classification"] is not None:
        _validate_enum(updates["data_classification"], VALID_CLASSIFICATIONS, "data_classification")
    if "status" in updates and updates["status"] is not None:
        _validate_enum(updates["status"], VALID_STATUSES, "status")
    if "review_period_months" in updates and updates["review_period_months"] is not None and updates["review_period_months"] <= 0:
        raise HTTPException(status_code=400, detail="review_period_months must be > 0")

    for field, value in updates.items():
        setattr(item, field, value)

    await db.flush()
    await db.refresh(item)
    return _to_response(item)


class ReviewBody(BaseModel):
    reviewed_on: date | None = None
    extend_months: int | None = None
    notes: str | None = None


@router.post("/{service_id}/review", response_model=CloudServiceResponse)
async def review_cloud_service(
    service_id: uuid.UUID,
    body: ReviewBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(CloudService).where(CloudService.id == service_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cloud service not found")

    reviewed_on = body.reviewed_on or date.today()
    months = body.extend_months or item.review_period_months
    if months <= 0:
        raise HTTPException(status_code=400, detail="extend_months must be > 0")
    item.last_reviewed_date = reviewed_on
    item.next_review_date = _add_months(reviewed_on, months)
    if body.notes:
        item.notes = (item.notes + "\n\n" if item.notes else "") + f"[{reviewed_on.isoformat()}] {body.notes}"
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cloud_service(
    service_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exists = (await db.execute(select(CloudService.id).where(CloudService.id == service_id))).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Cloud service not found")
    await db.execute(text("DELETE FROM cloud_services WHERE id = :sid"), {"sid": service_id})
