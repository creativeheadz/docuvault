import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.app_settings import AppSettings
from app.models.sidebar_item import SidebarItem
from app.models.ip_whitelist import IPWhitelist
from app.models.user import User

router = APIRouter(prefix="/settings", tags=["settings"])


# --- App Settings Schemas ---

class AppSettingsCreate(BaseModel):
    key: str
    value: dict | None = None


class AppSettingsUpdate(BaseModel):
    value: dict | None = None


class AppSettingsResponse(BaseModel):
    id: uuid.UUID
    key: str
    value: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Sidebar Item Schemas ---

class SidebarItemCreate(BaseModel):
    item_key: str
    label: str
    icon: str | None = None
    sort_order: int = 0
    is_visible: bool = True


class SidebarItemUpdate(BaseModel):
    label: str | None = None
    icon: str | None = None
    sort_order: int | None = None
    is_visible: bool | None = None


class SidebarItemResponse(BaseModel):
    id: uuid.UUID
    item_key: str
    label: str
    icon: str | None = None
    sort_order: int
    is_visible: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- IP Whitelist Schemas ---

class IPWhitelistCreate(BaseModel):
    ip_address: str
    is_active: bool = True


class IPWhitelistUpdate(BaseModel):
    ip_address: str | None = None
    is_active: bool | None = None


class IPWhitelistResponse(BaseModel):
    id: uuid.UUID
    ip_address: str
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# ===================== App Settings Endpoints =====================

@router.get("/app", response_model=list[AppSettingsResponse])
async def list_app_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(AppSettings).order_by(AppSettings.key))
    return result.scalars().all()


@router.post("/app", response_model=AppSettingsResponse, status_code=status.HTTP_201_CREATED)
async def create_app_setting(
    body: AppSettingsCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = AppSettings(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/app/{item_id}", response_model=AppSettingsResponse)
async def get_app_setting(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(AppSettings).where(AppSettings.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="App setting not found")
    return item


@router.put("/app/{item_id}", response_model=AppSettingsResponse)
async def update_app_setting(
    item_id: uuid.UUID,
    body: AppSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(AppSettings).where(AppSettings.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="App setting not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/app/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_app_setting(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(AppSettings).where(AppSettings.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="App setting not found")
    await db.delete(item)


# ===================== Sidebar Item Endpoints =====================

@router.get("/sidebar", response_model=list[SidebarItemResponse])
async def list_sidebar_items(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(SidebarItem).order_by(SidebarItem.sort_order))
    return result.scalars().all()


@router.post("/sidebar", response_model=SidebarItemResponse, status_code=status.HTTP_201_CREATED)
async def create_sidebar_item(
    body: SidebarItemCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = SidebarItem(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/sidebar/{item_id}", response_model=SidebarItemResponse)
async def get_sidebar_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(SidebarItem).where(SidebarItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Sidebar item not found")
    return item


@router.put("/sidebar/{item_id}", response_model=SidebarItemResponse)
async def update_sidebar_item(
    item_id: uuid.UUID,
    body: SidebarItemUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(SidebarItem).where(SidebarItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Sidebar item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/sidebar/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sidebar_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(SidebarItem).where(SidebarItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Sidebar item not found")
    await db.delete(item)


# ===================== IP Whitelist Endpoints =====================

@router.get("/ip-whitelist", response_model=list[IPWhitelistResponse])
async def list_ip_whitelist(
    is_active: bool | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(IPWhitelist)
    if is_active is not None:
        query = query.where(IPWhitelist.is_active == is_active)
    result = await db.execute(query.order_by(IPWhitelist.ip_address))
    return result.scalars().all()


@router.post("/ip-whitelist", response_model=IPWhitelistResponse, status_code=status.HTTP_201_CREATED)
async def create_ip_whitelist(
    body: IPWhitelistCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = IPWhitelist(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/ip-whitelist/{item_id}", response_model=IPWhitelistResponse)
async def get_ip_whitelist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(IPWhitelist).where(IPWhitelist.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="IP whitelist entry not found")
    return item


@router.put("/ip-whitelist/{item_id}", response_model=IPWhitelistResponse)
async def update_ip_whitelist(
    item_id: uuid.UUID,
    body: IPWhitelistUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(IPWhitelist).where(IPWhitelist.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="IP whitelist entry not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/ip-whitelist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ip_whitelist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(IPWhitelist).where(IPWhitelist.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="IP whitelist entry not found")
    await db.delete(item)
