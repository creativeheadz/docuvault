import csv
import io
import uuid
from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.firewall_rule import FirewallRule
from app.models.user import User

router = APIRouter(prefix="/firewall-rules", tags=["firewall-rules"])


VALID_DIRECTIONS = {"inbound", "outbound"}
VALID_PROTOCOLS = {"TCP", "UDP", "TCP+UDP", "ICMP", "Any"}
VALID_STATUSES = {"active", "pending", "removed"}


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    # Clamp the day to the last valid day of the target month.
    if month == 12:
        next_month_first = date(year + 1, 1, 1)
    else:
        next_month_first = date(year, month + 1, 1)
    last_day = (next_month_first - timedelta(days=1)).day
    return date(year, month, min(d.day, last_day))


# --- Schemas ---

class FirewallRuleCreate(BaseModel):
    name: str = Field(..., max_length=200)
    organization_id: uuid.UUID | None = None
    configuration_id: uuid.UUID | None = None
    direction: str = "inbound"
    external_port: str = Field(..., max_length=50)
    internal_host: str = Field(..., max_length=255)
    internal_port: str | None = None
    protocol: str = "TCP"
    business_need: str
    approved_by: str = Field(..., max_length=200)
    approved_date: date
    review_period_months: int = 6
    next_review_date: date | None = None
    last_reviewed_date: date | None = None
    status: str = "active"
    removed_date: date | None = None
    notes: str | None = None


class FirewallRuleUpdate(BaseModel):
    name: str | None = None
    organization_id: uuid.UUID | None = None
    configuration_id: uuid.UUID | None = None
    direction: str | None = None
    external_port: str | None = None
    internal_host: str | None = None
    internal_port: str | None = None
    protocol: str | None = None
    business_need: str | None = None
    approved_by: str | None = None
    approved_date: date | None = None
    review_period_months: int | None = None
    next_review_date: date | None = None
    last_reviewed_date: date | None = None
    status: str | None = None
    removed_date: date | None = None
    notes: str | None = None


class FirewallRuleResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    configuration_id: uuid.UUID | None
    name: str
    direction: str
    external_port: str
    internal_host: str
    internal_port: str | None
    protocol: str
    business_need: str
    approved_by: str
    approved_date: date
    review_period_months: int
    next_review_date: date
    last_reviewed_date: date | None
    status: str
    removed_date: date | None
    notes: str | None
    archived_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    organization_name: str | None = None
    configuration_name: str | None = None
    days_until_review: int | None = None

    model_config = {"from_attributes": True}


def _validate_enum(value: str, allowed: set[str], field: str) -> None:
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid {field}. Must be one of: {sorted(allowed)}")


def _to_response(rule: FirewallRule) -> FirewallRuleResponse:
    resp = FirewallRuleResponse.model_validate(rule)
    resp.organization_name = rule.organization.name if rule.organization else None
    resp.configuration_name = rule.configuration.name if rule.configuration else None
    if rule.status == "active":
        resp.days_until_review = (rule.next_review_date - date.today()).days
    else:
        resp.days_until_review = None
    return resp


# --- Endpoints ---

@router.get("", response_model=list[FirewallRuleResponse])
async def list_firewall_rules(
    organization_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    include_archived: bool = Query(False),
    overdue_only: bool = Query(False, description="Only rules whose next_review_date <= today and status=active"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(FirewallRule)
    if not include_archived:
        query = query.where(FirewallRule.archived_at.is_(None))
    if organization_id is not None:
        query = query.where(FirewallRule.organization_id == organization_id)
    if status_filter:
        query = query.where(FirewallRule.status == status_filter)
    if overdue_only:
        query = query.where(
            FirewallRule.status == "active",
            FirewallRule.next_review_date <= date.today(),
        )
    query = query.order_by(FirewallRule.next_review_date.asc(), FirewallRule.created_at.desc())
    items = (await db.execute(query)).scalars().all()
    return [_to_response(r) for r in items]


@router.get("/stats")
async def firewall_rules_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    soon = today + timedelta(days=30)
    base = select(func.count(FirewallRule.id)).where(FirewallRule.archived_at.is_(None))
    total = (await db.execute(base)).scalar_one()
    active = (await db.execute(base.where(FirewallRule.status == "active"))).scalar_one()
    overdue = (await db.execute(
        base.where(FirewallRule.status == "active", FirewallRule.next_review_date <= today)
    )).scalar_one()
    due_soon = (await db.execute(
        base.where(
            FirewallRule.status == "active",
            FirewallRule.next_review_date > today,
            FirewallRule.next_review_date <= soon,
        )
    )).scalar_one()
    return {"total": total, "active": active, "overdue": overdue, "due_soon": due_soon}


@router.get("/export.csv")
async def export_firewall_rules_csv(
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(FirewallRule)
    if not include_archived:
        query = query.where(FirewallRule.archived_at.is_(None))
    query = query.order_by(FirewallRule.next_review_date.asc())
    items = (await db.execute(query)).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Name", "Direction", "Protocol", "External port", "Internal host", "Internal port",
        "Business need", "Approved by", "Approved date", "Review every (months)",
        "Next review date", "Last reviewed", "Status", "Removed date",
        "Organization", "Configuration", "Notes",
    ])
    for r in items:
        writer.writerow([
            r.name, r.direction, r.protocol, r.external_port, r.internal_host, r.internal_port or "",
            r.business_need, r.approved_by, r.approved_date.isoformat(), r.review_period_months,
            r.next_review_date.isoformat(),
            r.last_reviewed_date.isoformat() if r.last_reviewed_date else "",
            r.status,
            r.removed_date.isoformat() if r.removed_date else "",
            r.organization.name if r.organization else "",
            r.configuration.name if r.configuration else "",
            r.notes or "",
        ])
    buf.seek(0)
    filename = f"firewall-rule-register-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=FirewallRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_firewall_rule(
    body: FirewallRuleCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _validate_enum(body.direction, VALID_DIRECTIONS, "direction")
    _validate_enum(body.protocol, VALID_PROTOCOLS, "protocol")
    _validate_enum(body.status, VALID_STATUSES, "status")
    if body.review_period_months <= 0:
        raise HTTPException(status_code=400, detail="review_period_months must be > 0")

    data = body.model_dump()
    if data.get("next_review_date") is None:
        data["next_review_date"] = _add_months(body.approved_date, body.review_period_months)

    item = FirewallRule(**data)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


@router.get("/{rule_id}", response_model=FirewallRuleResponse)
async def get_firewall_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(FirewallRule).where(FirewallRule.id == rule_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Firewall rule not found")
    return _to_response(item)


@router.put("/{rule_id}", response_model=FirewallRuleResponse)
async def update_firewall_rule(
    rule_id: uuid.UUID,
    body: FirewallRuleUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(FirewallRule).where(FirewallRule.id == rule_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Firewall rule not found")

    updates = body.model_dump(exclude_unset=True)
    if "direction" in updates and updates["direction"] is not None:
        _validate_enum(updates["direction"], VALID_DIRECTIONS, "direction")
    if "protocol" in updates and updates["protocol"] is not None:
        _validate_enum(updates["protocol"], VALID_PROTOCOLS, "protocol")
    if "status" in updates and updates["status"] is not None:
        _validate_enum(updates["status"], VALID_STATUSES, "status")
    if "review_period_months" in updates and updates["review_period_months"] is not None and updates["review_period_months"] <= 0:
        raise HTTPException(status_code=400, detail="review_period_months must be > 0")

    prev_status = item.status
    for field, value in updates.items():
        setattr(item, field, value)

    # If status flipped to removed and no removed_date was supplied, stamp today.
    if updates.get("status") == "removed" and prev_status != "removed" and item.removed_date is None:
        item.removed_date = date.today()
    if updates.get("status") and updates["status"] != "removed":
        # Re-activating a previously removed rule clears the removed_date.
        item.removed_date = None

    await db.flush()
    await db.refresh(item)
    return _to_response(item)


class ReviewBody(BaseModel):
    reviewed_on: date | None = None
    extend_months: int | None = None
    notes: str | None = None


@router.post("/{rule_id}/review", response_model=FirewallRuleResponse)
async def review_firewall_rule(
    rule_id: uuid.UUID,
    body: ReviewBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Record that a rule was reviewed today (or on a given date) and bump next_review_date."""
    item = (await db.execute(select(FirewallRule).where(FirewallRule.id == rule_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Firewall rule not found")

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


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_firewall_rule(
    rule_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exists = (await db.execute(select(FirewallRule.id).where(FirewallRule.id == rule_id))).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Firewall rule not found")
    await db.execute(text("DELETE FROM firewall_rules WHERE id = :rid"), {"rid": rule_id})
