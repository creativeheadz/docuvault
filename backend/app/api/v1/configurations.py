import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.configuration import Configuration
from app.models.user import User
from app.schemas.configuration import ConfigurationCreate, ConfigurationUpdate, ConfigurationResponse

router = APIRouter(prefix="/configurations", tags=["configurations"])


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
