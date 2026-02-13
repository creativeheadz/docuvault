import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.checklist import Checklist, ChecklistItem
from app.models.user import User

router = APIRouter(prefix="/checklists", tags=["checklists"])


# --- Schemas ---

class ChecklistItemCreate(BaseModel):
    content: str
    is_checked: bool = False
    parent_id: uuid.UUID | None = None
    sort_order: int = 0


class ChecklistItemUpdate(BaseModel):
    content: str | None = None
    is_checked: bool | None = None
    parent_id: uuid.UUID | None = None
    sort_order: int | None = None


class ChecklistItemResponse(BaseModel):
    id: uuid.UUID
    checklist_id: uuid.UUID
    content: str
    is_checked: bool
    parent_id: uuid.UUID | None = None
    sort_order: int
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChecklistCreate(BaseModel):
    organization_id: uuid.UUID
    name: str
    description: str | None = None


class ChecklistUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ChecklistResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None = None
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    items: list[ChecklistItemResponse] = []

    model_config = {"from_attributes": True}


# --- Checklist Endpoints ---

@router.get("", response_model=list[ChecklistResponse])
async def list_checklists(
    organization_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Checklist).where(Checklist.archived_at.is_(None))
    if organization_id:
        query = query.where(Checklist.organization_id == organization_id)
    items = (
        await db.execute(
            query.order_by(Checklist.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return items


@router.post("", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
async def create_checklist(
    body: ChecklistCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = Checklist(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=ChecklistResponse)
async def get_checklist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Checklist).where(Checklist.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return item


@router.put("/{item_id}", response_model=ChecklistResponse)
async def update_checklist(
    item_id: uuid.UUID,
    body: ChecklistUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Checklist).where(Checklist.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Checklist).where(Checklist.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist not found")
    await db.delete(item)


# --- Checklist Item Endpoints ---

@router.post("/{checklist_id}/items", response_model=ChecklistItemResponse, status_code=status.HTTP_201_CREATED)
async def create_checklist_item(
    checklist_id: uuid.UUID,
    body: ChecklistItemCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Checklist).where(Checklist.id == checklist_id))
    checklist = result.scalar_one_or_none()
    if not checklist:
        raise HTTPException(status_code=404, detail="Checklist not found")
    item = ChecklistItem(checklist_id=checklist_id, **body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.put("/{checklist_id}/items/{item_id}", response_model=ChecklistItemResponse)
async def update_checklist_item(
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ChecklistItemUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChecklistItem).where(ChecklistItem.id == item_id, ChecklistItem.checklist_id == checklist_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.post("/{checklist_id}/items/{item_id}/toggle", response_model=ChecklistItemResponse)
async def toggle_checklist_item(
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChecklistItem).where(ChecklistItem.id == item_id, ChecklistItem.checklist_id == checklist_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    item.is_checked = not item.is_checked
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{checklist_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_checklist_item(
    checklist_id: uuid.UUID,
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChecklistItem).where(ChecklistItem.id == item_id, ChecklistItem.checklist_id == checklist_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    await db.delete(item)
