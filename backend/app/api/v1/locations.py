import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.location import Location
from app.models.user import User
from app.schemas.location import LocationCreate, LocationUpdate, LocationResponse

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("", response_model=list[LocationResponse])
async def list_locations(
    organization_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Location).where(Location.archived_at.is_(None))
    if organization_id:
        query = query.where(Location.organization_id == organization_id)
    items = (await db.execute(query.order_by(Location.name).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return items


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def create_location(body: LocationCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    loc = Location(**body.model_dump())
    db.add(loc)
    await db.flush()
    await db.refresh(loc)
    return loc


@router.get("/{item_id}", response_model=LocationResponse)
async def get_location(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Location).where(Location.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Location not found")
    return item


@router.put("/{item_id}", response_model=LocationResponse)
async def update_location(item_id: uuid.UUID, body: LocationUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Location).where(Location.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Location not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Location).where(Location.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.delete(item)
