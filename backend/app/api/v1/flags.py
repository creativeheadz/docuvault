import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.flag import Flag
from app.models.user import User

router = APIRouter(prefix="/flags", tags=["flags"])


# --- Schemas ---

class FlagCreate(BaseModel):
    entity_type: str
    entity_id: uuid.UUID
    flag_type: str
    message: str | None = None


class FlagResponse(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    flag_type: str
    message: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.get("", response_model=list[FlagResponse])
async def list_flags(
    entity_type: str | None = Query(None),
    entity_id: uuid.UUID | None = Query(None),
    flag_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Flag)
    if entity_type:
        query = query.where(Flag.entity_type == entity_type)
    if entity_id:
        query = query.where(Flag.entity_id == entity_id)
    if flag_type:
        query = query.where(Flag.flag_type == flag_type)
    items = (
        await db.execute(
            query.order_by(Flag.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return items


@router.post("", response_model=FlagResponse, status_code=status.HTTP_201_CREATED)
async def create_flag(
    body: FlagCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    flag = Flag(**body.model_dump())
    db.add(flag)
    await db.flush()
    await db.refresh(flag)
    return flag


@router.get("/{item_id}", response_model=FlagResponse)
async def get_flag(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Flag).where(Flag.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flag not found")
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flag(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Flag).where(Flag.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flag not found")
    await db.delete(item)
