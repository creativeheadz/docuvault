import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.configuration import Configuration
from app.models.user import User
from app.schemas.configuration import ConfigurationCreate, ConfigurationUpdate, ConfigurationResponse

router = APIRouter(prefix="/configurations", tags=["configurations"])


@router.get("/fleet-readiness")
async def fleet_readiness(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Cyber Essentials readiness summary across in-scope configurations."""
    today = date.today()
    base = select(func.count(Configuration.id)).where(
        Configuration.archived_at.is_(None),
        Configuration.ce_in_scope.is_(True),
    )
    in_scope = (await db.execute(base)).scalar_one()
    no_firewall_data = (await db.execute(
        base.where(Configuration.software_firewall_on.is_(None))
    )).scalar_one()
    firewall_off = (await db.execute(
        base.where(Configuration.software_firewall_on.is_(False))
    )).scalar_one()
    no_malware_protection = (await db.execute(
        base.where(
            (Configuration.malware_protection.is_(None))
            | (Configuration.malware_protection == "none")
        )
    )).scalar_one()
    os_eol_now = (await db.execute(
        base.where(Configuration.os_eol_date.isnot(None), Configuration.os_eol_date <= today)
    )).scalar_one()
    os_eol_soon = (await db.execute(
        base.where(
            Configuration.os_eol_date.isnot(None),
            Configuration.os_eol_date > today,
            Configuration.os_eol_date <= date(today.year + (today.month + 6 > 12), ((today.month + 6 - 1) % 12) + 1, min(today.day, 28)),
        )
    )).scalar_one()
    patch_stale = (await db.execute(
        base.where(Configuration.last_patched_date.isnot(None))
        .where(Configuration.last_patched_date < date(today.year, today.month, 1))  # not patched this calendar month
    )).scalar_one()
    return {
        "in_scope": in_scope,
        "no_firewall_data": no_firewall_data,
        "firewall_off": firewall_off,
        "no_malware_protection": no_malware_protection,
        "os_eol_now": os_eol_now,
        "os_eol_soon": os_eol_soon,
        "patch_stale": patch_stale,
    }


@router.get("", response_model=list[ConfigurationResponse])
async def list_configurations(
    organization_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query("", max_length=255),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Configuration).where(Configuration.archived_at.is_(None))
    if organization_id:
        query = query.where(Configuration.organization_id == organization_id)
    if search:
        query = query.where(Configuration.name.ilike(f"%{search}%"))
    items = (await db.execute(query.order_by(Configuration.name).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return items


@router.post("", response_model=ConfigurationResponse, status_code=status.HTTP_201_CREATED)
async def create_configuration(body: ConfigurationCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    item = Configuration(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=ConfigurationResponse)
async def get_configuration(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Configuration).where(Configuration.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return item


@router.put("/{item_id}", response_model=ConfigurationResponse)
async def update_configuration(item_id: uuid.UUID, body: ConfigurationUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Configuration).where(Configuration.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Configuration not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_configuration(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Configuration).where(Configuration.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await db.delete(item)
