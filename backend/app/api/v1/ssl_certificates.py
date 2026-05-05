import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.ssl_certificate import SSLCertificate
from app.models.user import User
from app.schemas.ssl_certificate import (
    SSLCertificateCreate,
    SSLCertificateUpdate,
    SSLCertificateResponse,
    SSLProbeRequest,
    SSLProbeResponse,
)
from app.services.ssl_probe import probe_host, derive_host_from_common_name
from datetime import datetime, timezone

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


@router.post("/{item_id}/probe", response_model=SSLProbeResponse)
async def probe_ssl_certificate(
    item_id: uuid.UUID,
    body: SSLProbeRequest | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Open a TLS connection to the cert's hostname, read the live cert,
    and overwrite the stored fields with the truth."""
    result = await db.execute(select(SSLCertificate).where(SSLCertificate.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="SSL Certificate not found")

    body = body or SSLProbeRequest()
    host = (body.host or item.host or derive_host_from_common_name(item.common_name) or "").strip()
    port = body.port or item.port or 443
    if not host:
        raise HTTPException(status_code=400, detail="No host to probe — set the certificate's host or pass one explicitly")

    try:
        info = await probe_host(host, port)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TLS probe failed: {e}")

    item.host = info["host"]
    item.port = info["port"]
    item.subject_cn = info["subject_cn"]
    item.issuer = info["issuer"]
    item.serial_number = info["serial_number"]
    item.signature_algorithm = info["signature_algorithm"]
    item.key_algorithm = info["key_algorithm"]
    item.key_size = info["key_size"]
    item.sans = info["sans"] or None
    item.issued_date = info["issued_date"]
    item.expiration_date = info["expiration_date"]
    item.last_probed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(item)

    return SSLProbeResponse(
        certificate=SSLCertificateResponse.model_validate(item),
        tls_version=info["tls_version"],
        cipher=info["cipher"],
        is_expired=info["is_expired"],
        days_until_expiry=info["days_until_expiry"],
    )
