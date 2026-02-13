import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.domain import Domain
from app.models.user import User
from app.schemas.domain import DomainCreate, DomainUpdate, DomainResponse

router = APIRouter(prefix="/domains", tags=["domains"])


@router.get("", response_model=list[DomainResponse])
async def list_domains(
    organization_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Domain).where(Domain.archived_at.is_(None))
    if organization_id:
        query = query.where(Domain.organization_id == organization_id)
    items = (await db.execute(query.order_by(Domain.domain_name).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return items


@router.post("", response_model=DomainResponse, status_code=status.HTTP_201_CREATED)
async def create_domain(body: DomainCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    item = Domain(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=DomainResponse)
async def get_domain(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Domain).where(Domain.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Domain not found")
    return item


@router.put("/{item_id}", response_model=DomainResponse)
async def update_domain(item_id: uuid.UUID, body: DomainUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Domain).where(Domain.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Domain not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Domain).where(Domain.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Domain not found")
    await db.delete(item)
