import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.attachment import Attachment
from app.models.user import User

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.get("")
async def list_attachments(
    attachable_type: str = Query(...),
    attachable_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Attachment)
        .where(Attachment.attachable_type == attachable_type, Attachment.attachable_id == attachable_id)
        .order_by(Attachment.created_at.desc())
    )
    return [{"id": str(a.id), "file_name": a.file_name, "file_size": a.file_size, "content_type": a.content_type, "created_at": str(a.created_at)} for a in result.scalars().all()]


@router.post("")
async def upload_attachment(
    file: UploadFile = File(...),
    attachable_type: str = Form(...),
    attachable_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    upload_dir = os.path.join(settings.UPLOAD_DIR, attachable_type, attachable_id)
    os.makedirs(upload_dir, exist_ok=True)

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "")[1]
    file_path = os.path.join(upload_dir, f"{file_id}{ext}")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    att = Attachment(
        attachable_type=attachable_type,
        attachable_id=uuid.UUID(attachable_id),
        file_name=file.filename or "unnamed",
        file_path=file_path,
        file_size=len(content),
        content_type=file.content_type,
    )
    db.add(att)
    await db.flush()
    await db.refresh(att)

    return {"id": str(att.id), "file_name": att.file_name, "file_size": att.file_size}


@router.get("/{att_id}/download")
async def download_attachment(att_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Attachment).where(Attachment.id == att_id))
    att = result.scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(att.file_path, filename=att.file_name, media_type=att.content_type)


@router.delete("/{att_id}", status_code=204)
async def delete_attachment(att_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Attachment).where(Attachment.id == att_id))
    att = result.scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if os.path.exists(att.file_path):
        os.remove(att.file_path)
    await db.delete(att)
