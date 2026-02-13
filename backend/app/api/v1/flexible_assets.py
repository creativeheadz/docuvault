import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.flexible_asset import FlexibleAsset
from app.models.user import User
from app.schemas.flexible_asset import FlexibleAssetCreate, FlexibleAssetUpdate, FlexibleAssetResponse

router = APIRouter(prefix="/flexible-assets", tags=["flexible-assets"])


@router.get("", response_model=list[FlexibleAssetResponse])
async def list_assets(
    asset_type_id: uuid.UUID | None = Query(None),
    organization_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(FlexibleAsset).where(FlexibleAsset.archived_at.is_(None))
    if asset_type_id:
        query = query.where(FlexibleAsset.asset_type_id == asset_type_id)
    if organization_id:
        query = query.where(FlexibleAsset.organization_id == organization_id)
    items = (await db.execute(query.order_by(FlexibleAsset.name).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return items


@router.post("", response_model=FlexibleAssetResponse, status_code=status.HTTP_201_CREATED)
async def create_asset(body: FlexibleAssetCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    item = FlexibleAsset(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=FlexibleAssetResponse)
async def get_asset(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(FlexibleAsset).where(FlexibleAsset.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flexible asset not found")
    return item


@router.put("/{item_id}", response_model=FlexibleAssetResponse)
async def update_asset(item_id: uuid.UUID, body: FlexibleAssetUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(FlexibleAsset).where(FlexibleAsset.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flexible asset not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(FlexibleAsset).where(FlexibleAsset.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flexible asset not found")
    await db.delete(item)
