import csv
import io
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, model_validator
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.contact import Contact
from app.models.cloud_service import CloudService
from app.models.configuration import Configuration
from app.models.user_access import UserAccess
from app.models.user import User

router = APIRouter(prefix="/user-access", tags=["user-access"])


VALID_PRIVILEGES = {"standard", "admin", "owner"}
VALID_CATEGORIES = {"employee", "contractor", "msp", "vendor", "customer"}


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

class UserAccessCreate(BaseModel):
    contact_id: uuid.UUID
    cloud_service_id: uuid.UUID | None = None
    configuration_id: uuid.UUID | None = None
    custom_system_label: str | None = None

    privilege_level: str = "standard"
    person_category: str | None = None
    mfa_enabled: bool = False
    is_active: bool = True

    access_granted_date: date | None = None
    last_reviewed_date: date | None = None
    review_period_months: int = 6
    next_review_date: date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def one_target(self):
        targets = [self.cloud_service_id, self.configuration_id, self.custom_system_label]
        filled = sum(1 for t in targets if t is not None and t != "")
        if filled != 1:
            raise ValueError("Exactly one of cloud_service_id, configuration_id, or custom_system_label must be provided")
        return self


class UserAccessUpdate(BaseModel):
    privilege_level: str | None = None
    person_category: str | None = None
    mfa_enabled: bool | None = None
    is_active: bool | None = None
    access_granted_date: date | None = None
    last_reviewed_date: date | None = None
    review_period_months: int | None = None
    next_review_date: date | None = None
    notes: str | None = None


class UserAccessResponse(BaseModel):
    id: uuid.UUID
    contact_id: uuid.UUID
    contact_name: str
    contact_email: str | None

    cloud_service_id: uuid.UUID | None
    configuration_id: uuid.UUID | None
    custom_system_label: str | None
    system_type: str  # "cloud_service" | "configuration" | "custom"
    system_label: str
    system_key: str  # composite key for grouping (e.g. "cs:<uuid>")

    privilege_level: str
    person_category: str | None
    mfa_enabled: bool
    is_active: bool

    access_granted_date: date | None
    last_reviewed_date: date | None
    review_period_months: int
    next_review_date: date
    days_until_review: int | None

    notes: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


def _to_response(item: UserAccess) -> UserAccessResponse:
    contact = item.contact
    contact_name = f"{contact.first_name} {contact.last_name}".strip() if contact else "(deleted)"
    contact_email = contact.email if contact else None

    if item.cloud_service_id:
        system_type = "cloud_service"
        system_label = item.cloud_service.name if item.cloud_service else "(deleted cloud service)"
        system_key = f"cs:{item.cloud_service_id}"
    elif item.configuration_id:
        system_type = "configuration"
        system_label = item.configuration.name if item.configuration else "(deleted configuration)"
        system_key = f"cfg:{item.configuration_id}"
    else:
        system_type = "custom"
        system_label = item.custom_system_label or "(unnamed)"
        system_key = f"custom:{item.custom_system_label}"

    days = (item.next_review_date - date.today()).days if item.is_active else None

    return UserAccessResponse(
        id=item.id,
        contact_id=item.contact_id,
        contact_name=contact_name,
        contact_email=contact_email,
        cloud_service_id=item.cloud_service_id,
        configuration_id=item.configuration_id,
        custom_system_label=item.custom_system_label,
        system_type=system_type,
        system_label=system_label,
        system_key=system_key,
        privilege_level=item.privilege_level,
        person_category=item.person_category,
        mfa_enabled=item.mfa_enabled,
        is_active=item.is_active,
        access_granted_date=item.access_granted_date,
        last_reviewed_date=item.last_reviewed_date,
        review_period_months=item.review_period_months,
        next_review_date=item.next_review_date,
        days_until_review=days,
        notes=item.notes,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _validate_enum(value: str, allowed: set[str], field: str) -> None:
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid {field}. Must be one of: {sorted(allowed)}")


# --- Endpoints ---

@router.get("", response_model=list[UserAccessResponse])
async def list_user_access(
    contact_id: uuid.UUID | None = Query(None),
    cloud_service_id: uuid.UUID | None = Query(None),
    configuration_id: uuid.UUID | None = Query(None),
    include_inactive: bool = Query(False),
    overdue_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(UserAccess)
    if not include_inactive:
        query = query.where(UserAccess.is_active.is_(True))
    if contact_id:
        query = query.where(UserAccess.contact_id == contact_id)
    if cloud_service_id:
        query = query.where(UserAccess.cloud_service_id == cloud_service_id)
    if configuration_id:
        query = query.where(UserAccess.configuration_id == configuration_id)
    if overdue_only:
        query = query.where(UserAccess.is_active.is_(True), UserAccess.next_review_date <= date.today())
    query = query.order_by(UserAccess.next_review_date.asc())
    items = (await db.execute(query)).scalars().all()
    return [_to_response(i) for i in items]


@router.get("/stats")
async def user_access_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    base = select(func.count(UserAccess.id))
    total = (await db.execute(base.where(UserAccess.is_active.is_(True)))).scalar_one()
    admins = (await db.execute(base.where(
        UserAccess.is_active.is_(True),
        UserAccess.privilege_level.in_(("admin", "owner")),
    ))).scalar_one()
    no_mfa_admins = (await db.execute(base.where(
        UserAccess.is_active.is_(True),
        UserAccess.privilege_level.in_(("admin", "owner")),
        UserAccess.mfa_enabled.is_(False),
    ))).scalar_one()
    no_mfa = (await db.execute(base.where(
        UserAccess.is_active.is_(True),
        UserAccess.mfa_enabled.is_(False),
    ))).scalar_one()
    overdue = (await db.execute(base.where(
        UserAccess.is_active.is_(True),
        UserAccess.next_review_date <= today,
    ))).scalar_one()
    return {
        "active_accesses": total,
        "admin_accesses": admins,
        "no_mfa": no_mfa,
        "no_mfa_admins": no_mfa_admins,
        "overdue_reviews": overdue,
    }


@router.get("/matrix")
async def access_matrix(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return the data shape ready to render a people × systems grid."""
    accesses = (await db.execute(
        select(UserAccess).where(UserAccess.is_active.is_(True))
    )).scalars().all()

    contact_ids = {a.contact_id for a in accesses}
    contacts = []
    if contact_ids:
        rows = (await db.execute(
            select(Contact).where(Contact.id.in_(contact_ids), Contact.archived_at.is_(None))
            .order_by(Contact.last_name, Contact.first_name)
        )).scalars().all()
        contacts = [{"id": str(c.id), "name": f"{c.first_name} {c.last_name}".strip(), "email": c.email} for c in rows]

    systems: dict[str, dict] = {}
    for a in accesses:
        if a.cloud_service_id:
            key = f"cs:{a.cloud_service_id}"
            name = a.cloud_service.name if a.cloud_service else "(deleted)"
            systems.setdefault(key, {"key": key, "type": "cloud_service", "name": name})
        elif a.configuration_id:
            key = f"cfg:{a.configuration_id}"
            name = a.configuration.name if a.configuration else "(deleted)"
            systems.setdefault(key, {"key": key, "type": "configuration", "name": name})
        elif a.custom_system_label:
            key = f"custom:{a.custom_system_label}"
            systems.setdefault(key, {"key": key, "type": "custom", "name": a.custom_system_label})

    cells = []
    for a in accesses:
        if a.cloud_service_id:
            key = f"cs:{a.cloud_service_id}"
        elif a.configuration_id:
            key = f"cfg:{a.configuration_id}"
        else:
            key = f"custom:{a.custom_system_label}"
        cells.append({
            "access_id": str(a.id),
            "contact_id": str(a.contact_id),
            "system_key": key,
            "privilege_level": a.privilege_level,
            "mfa_enabled": a.mfa_enabled,
            "next_review_date": a.next_review_date.isoformat(),
            "days_until_review": (a.next_review_date - date.today()).days,
        })

    return {
        "people": contacts,
        "systems": sorted(systems.values(), key=lambda s: (s["type"], s["name"].lower())),
        "cells": cells,
    }


@router.get("/export.csv")
async def export_csv(
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(UserAccess)
    if not include_inactive:
        query = query.where(UserAccess.is_active.is_(True))
    items = (await db.execute(query.order_by(UserAccess.next_review_date.asc()))).scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Person", "Email", "Category", "System type", "System",
        "Privilege", "MFA", "Active", "Granted", "Last reviewed",
        "Next review", "Review (months)", "Notes",
    ])
    for a in items:
        if a.cloud_service_id:
            system_type, system_label = "cloud_service", a.cloud_service.name if a.cloud_service else ""
        elif a.configuration_id:
            system_type, system_label = "configuration", a.configuration.name if a.configuration else ""
        else:
            system_type, system_label = "custom", a.custom_system_label or ""
        c = a.contact
        writer.writerow([
            f"{c.first_name} {c.last_name}".strip() if c else "",
            c.email if c else "",
            a.person_category or "",
            system_type,
            system_label,
            a.privilege_level,
            "yes" if a.mfa_enabled else "no",
            "yes" if a.is_active else "no",
            a.access_granted_date.isoformat() if a.access_granted_date else "",
            a.last_reviewed_date.isoformat() if a.last_reviewed_date else "",
            a.next_review_date.isoformat(),
            a.review_period_months,
            a.notes or "",
        ])
    buf.seek(0)
    filename = f"user-access-{date.today().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=UserAccessResponse, status_code=status.HTTP_201_CREATED)
async def create_user_access(
    body: UserAccessCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    _validate_enum(body.privilege_level, VALID_PRIVILEGES, "privilege_level")
    if body.person_category and body.person_category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid person_category. Must be one of: {sorted(VALID_CATEGORIES)}")
    if body.review_period_months <= 0:
        raise HTTPException(status_code=400, detail="review_period_months must be > 0")

    # FK existence checks
    contact = (await db.execute(select(Contact).where(Contact.id == body.contact_id))).scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    if body.cloud_service_id:
        cs = (await db.execute(select(CloudService.id).where(CloudService.id == body.cloud_service_id))).scalar_one_or_none()
        if not cs:
            raise HTTPException(status_code=404, detail="Cloud service not found")
    if body.configuration_id:
        cfg = (await db.execute(select(Configuration.id).where(Configuration.id == body.configuration_id))).scalar_one_or_none()
        if not cfg:
            raise HTTPException(status_code=404, detail="Configuration not found")

    data = body.model_dump()
    if data.get("next_review_date") is None:
        anchor = body.last_reviewed_date or body.access_granted_date or date.today()
        data["next_review_date"] = _add_months(anchor, body.review_period_months)

    item = UserAccess(**data)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


@router.put("/{access_id}", response_model=UserAccessResponse)
async def update_user_access(
    access_id: uuid.UUID,
    body: UserAccessUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(UserAccess).where(UserAccess.id == access_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="User access not found")
    updates = body.model_dump(exclude_unset=True)
    if "privilege_level" in updates and updates["privilege_level"] is not None:
        _validate_enum(updates["privilege_level"], VALID_PRIVILEGES, "privilege_level")
    if "person_category" in updates and updates["person_category"] and updates["person_category"] not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid person_category. Must be one of: {sorted(VALID_CATEGORIES)}")
    if "review_period_months" in updates and updates["review_period_months"] is not None and updates["review_period_months"] <= 0:
        raise HTTPException(status_code=400, detail="review_period_months must be > 0")
    for field, value in updates.items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


class ReviewBody(BaseModel):
    reviewed_on: date | None = None
    notes: str | None = None


@router.post("/{access_id}/review", response_model=UserAccessResponse)
async def review_user_access(
    access_id: uuid.UUID,
    body: ReviewBody,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = (await db.execute(select(UserAccess).where(UserAccess.id == access_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="User access not found")
    reviewed_on = body.reviewed_on or date.today()
    item.last_reviewed_date = reviewed_on
    item.next_review_date = _add_months(reviewed_on, item.review_period_months)
    if body.notes:
        item.notes = (item.notes + "\n\n" if item.notes else "") + f"[{reviewed_on.isoformat()}] {body.notes}"
    await db.flush()
    await db.refresh(item)
    return _to_response(item)


@router.delete("/{access_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_access(
    access_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    exists = (await db.execute(select(UserAccess.id).where(UserAccess.id == access_id))).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="User access not found")
    await db.execute(text("DELETE FROM user_accesses WHERE id = :aid"), {"aid": access_id})
