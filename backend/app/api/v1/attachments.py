import os
import re
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

# `attachable_type` names the resource an attachment hangs off, and it used
# to be interpolated straight into a filesystem path. os.path.join discards
# everything to the left of an absolute path, so "/etc/cron.d" escaped the
# upload directory entirely and "../" walked out of it - before any
# validation ran, because the id was only parsed as a UUID afterwards.
#
# A slug cannot contain a separator, a dot or a drive letter, so traversal
# stops being possible rather than being caught. The resolved path is
# checked against the upload root as well: one control for the input and
# one for the result, because this is the kind of code that gets edited by
# somebody who has not read this comment.
_TYPE_RE = re.compile(r"^[a-z][a-z0-9_]{0,49}$")

# The route reads the body into memory, so something has to bound it. The
# edge proxy caps this too; that cap does not protect a caller who reaches
# the API another way.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
_CHUNK = 1024 * 1024


def _upload_root() -> str:
    return os.path.realpath(settings.UPLOAD_DIR)


def _safe_dir(attachable_type: str, attachable_id: uuid.UUID) -> str:
    """The directory for this attachment, guaranteed to be under the root."""
    if not _TYPE_RE.match(attachable_type or ""):
        raise HTTPException(
            status_code=422,
            detail="attachable_type must be a lower-case identifier",
        )
    root = _upload_root()
    path = os.path.realpath(os.path.join(root, attachable_type, str(attachable_id)))
    if path != root and not path.startswith(root + os.sep):
        raise HTTPException(status_code=422, detail="Invalid attachment path")
    return path


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
    attachable_id: uuid.UUID = Form(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    upload_dir = _safe_dir(attachable_type, attachable_id)

    # The stored name is a fresh UUID; only the extension comes from the
    # caller, and it is filtered to stop a path or a NUL riding in on it.
    ext = os.path.splitext(file.filename or "")[1][:20]
    if not re.match(r"^\.[A-Za-z0-9]{1,19}$", ext or ""):
        ext = ""
    file_path = os.path.join(upload_dir, f"{uuid.uuid4()}{ext}")

    os.makedirs(upload_dir, exist_ok=True)
    size = 0
    try:
        with open(file_path, "wb") as f:
            while chunk := await file.read(_CHUNK):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Attachment exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
                    )
                f.write(chunk)
    except Exception:
        # Never leave a partial file behind for a request that failed.
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    att = Attachment(
        attachable_type=attachable_type,
        attachable_id=attachable_id,
        file_name=os.path.basename(file.filename or "unnamed")[:255],
        file_path=file_path,
        file_size=size,
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
    # Rows written before the path was constrained could point anywhere, so
    # the check is on the way out as well as on the way in.
    path = os.path.realpath(att.file_path)
    root = _upload_root()
    if not path.startswith(root + os.sep) or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(path, filename=att.file_name, media_type=att.content_type)


@router.delete("/{att_id}", status_code=204)
async def delete_attachment(att_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Attachment).where(Attachment.id == att_id))
    att = result.scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = os.path.realpath(att.file_path)
    if path.startswith(_upload_root() + os.sep) and os.path.isfile(path):
        os.remove(path)
    await db.delete(att)
