import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.flexible_asset_type import FlexibleAssetType
from app.models.flexible_asset_section import FlexibleAssetSection
from app.models.flexible_asset_field import FlexibleAssetField
from app.models.user import User
from app.schemas.flexible_asset import FlexibleAssetTypeCreate, FlexibleAssetTypeUpdate, FlexibleAssetTypeResponse

router = APIRouter(prefix="/flexible-asset-types", tags=["flexible-asset-types"])


@router.get("", response_model=list[FlexibleAssetTypeResponse])
async def list_types(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(FlexibleAssetType).order_by(FlexibleAssetType.name))
    return result.scalars().all()


@router.post("", response_model=FlexibleAssetTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_type(body: FlexibleAssetTypeCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    fat = FlexibleAssetType(name=body.name, description=body.description, icon=body.icon, color=body.color, is_enabled=body.is_enabled)
    db.add(fat)
    await db.flush()

    section_map = {}
    for s in body.sections:
        sec = FlexibleAssetSection(asset_type_id=fat.id, name=s.name, sort_order=s.sort_order)
        db.add(sec)
        await db.flush()
        section_map[s.name] = sec.id

    for f in body.fields:
        field = FlexibleAssetField(
            asset_type_id=fat.id,
            section_id=f.section_id,
            name=f.name,
            field_type=f.field_type,
            hint=f.hint,
            required=f.required,
            options=f.options,
            sort_order=f.sort_order,
        )
        db.add(field)

    await db.flush()
    await db.refresh(fat)
    return fat


@router.get("/{type_id}", response_model=FlexibleAssetTypeResponse)
async def get_type(type_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(FlexibleAssetType).where(FlexibleAssetType.id == type_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flexible asset type not found")
    return item


@router.put("/{type_id}", response_model=FlexibleAssetTypeResponse)
async def update_type(type_id: uuid.UUID, body: FlexibleAssetTypeUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(FlexibleAssetType).where(FlexibleAssetType.id == type_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flexible asset type not found")

    for field, value in body.model_dump(exclude_unset=True, exclude={"sections", "fields"}).items():
        setattr(item, field, value)

    if body.sections is not None:
        for sec in item.sections:
            await db.delete(sec)
        for s in body.sections:
            sec = FlexibleAssetSection(asset_type_id=item.id, name=s.name, sort_order=s.sort_order)
            db.add(sec)

    if body.fields is not None:
        for f in item.fields:
            await db.delete(f)
        await db.flush()
        for f in body.fields:
            field = FlexibleAssetField(
                asset_type_id=item.id,
                section_id=f.section_id,
                name=f.name,
                field_type=f.field_type,
                hint=f.hint,
                required=f.required,
                options=f.options,
                sort_order=f.sort_order,
            )
            db.add(field)

    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_type(type_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(FlexibleAssetType).where(FlexibleAssetType.id == type_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Flexible asset type not found")
    await db.delete(item)
