import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.ssl_certificate import SSLCertificate
from app.models.user import User
from app.schemas.ssl_certificate import SSLCertificateCreate, SSLCertificateUpdate, SSLCertificateResponse

router = APIRouter(prefix="/ssl-certificates", tags=["ssl-certificates"])


@router.get("", response_model=list[SSLCertificateResponse])
async def list_ssl_certificates(
    organization_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(SSLCertificate).where(SSLCertificate.archived_at.is_(None))
    if organization_id:
        query = query.where(SSLCertificate.organization_id == organization_id)
    items = (await db.execute(query.order_by(SSLCertificate.common_name).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return items


@router.post("", response_model=SSLCertificateResponse, status_code=status.HTTP_201_CREATED)
async def create_ssl_certificate(body: SSLCertificateCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    item = SSLCertificate(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=SSLCertificateResponse)
async def get_ssl_certificate(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="SSL Certificate not found")
    return item


@router.put("/{item_id}", response_model=SSLCertificateResponse)
async def update_ssl_certificate(item_id: uuid.UUID, body: SSLCertificateUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="SSL Certificate not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ssl_certificate(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="SSL Certificate not found")
    await db.delete(item)
