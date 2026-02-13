import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.document import Document
from app.models.document_version import DocumentVersion
from app.models.document_template import DocumentTemplate
from app.models.document_folder import DocumentFolder
from app.models.user import User
from app.schemas.document import (
    DocumentCreate, DocumentUpdate, DocumentResponse, DocumentVersionResponse,
    DocumentFolderCreate, DocumentFolderResponse, DocumentTemplateCreate, DocumentTemplateResponse,
)

router = APIRouter(prefix="/documents", tags=["documents"])


# --- Folders ---

@router.get("/folders", response_model=list[DocumentFolderResponse])
async def list_folders(organization_id: uuid.UUID | None = Query(None), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    query = select(DocumentFolder)
    if organization_id:
        query = query.where(DocumentFolder.organization_id == organization_id)
    return (await db.execute(query.order_by(DocumentFolder.name))).scalars().all()


@router.post("/folders", response_model=DocumentFolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(body: DocumentFolderCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    folder = DocumentFolder(**body.model_dump())
    db.add(folder)
    await db.flush()
    await db.refresh(folder)
    return folder


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(folder_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(DocumentFolder).where(DocumentFolder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.delete(folder)


# --- Templates ---

@router.get("/templates", response_model=list[DocumentTemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return (await db.execute(select(DocumentTemplate).order_by(DocumentTemplate.name))).scalars().all()


@router.post("/templates", response_model=DocumentTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(body: DocumentTemplateCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    t = DocumentTemplate(**body.model_dump())
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return t


# --- Documents ---

@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    organization_id: uuid.UUID | None = Query(None),
    folder_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query("", max_length=255),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Document).where(Document.archived_at.is_(None))
    if organization_id:
        query = query.where(Document.organization_id == organization_id)
    if folder_id:
        query = query.where(Document.folder_id == folder_id)
    if search:
        query = query.where(Document.title.ilike(f"%{search}%"))
    items = (await db.execute(query.order_by(Document.updated_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return items


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(body: DocumentCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    doc = Document(**body.model_dump(), version=1)
    db.add(doc)
    await db.flush()
    version = DocumentVersion(document_id=doc.id, version=1, content=doc.content, change_summary="Initial version")
    db.add(version)
    await db.flush()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.put("/{doc_id}", response_model=DocumentResponse)
async def update_document(doc_id: uuid.UUID, body: DocumentUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if body.content is not None and body.content != doc.content:
        doc.version += 1
        version = DocumentVersion(
            document_id=doc.id, version=doc.version,
            content=body.content, change_summary=body.change_summary or f"Version {doc.version}",
        )
        db.add(version)
        doc.content = body.content

    if body.title is not None:
        doc.title = body.title
    if body.folder_id is not None:
        doc.folder_id = body.folder_id

    await db.flush()
    await db.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.delete(doc)


@router.get("/{doc_id}/versions", response_model=list[DocumentVersionResponse])
async def list_versions(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == doc_id).order_by(DocumentVersion.version.desc())
    )
    return result.scalars().all()
