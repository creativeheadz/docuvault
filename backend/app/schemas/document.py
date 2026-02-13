import uuid
from datetime import datetime
from pydantic import BaseModel


class DocumentFolderCreate(BaseModel):
    organization_id: uuid.UUID | None = None
    parent_id: uuid.UUID | None = None
    name: str


class DocumentFolderResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    parent_id: uuid.UUID | None
    name: str
    model_config = {"from_attributes": True}


class DocumentCreate(BaseModel):
    organization_id: uuid.UUID | None = None
    folder_id: uuid.UUID | None = None
    title: str
    content: dict | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    folder_id: uuid.UUID | None = None
    content: dict | None = None
    change_summary: str | None = None


class DocumentResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    folder_id: uuid.UUID | None
    title: str
    content: dict | None
    version: int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class DocumentVersionResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    version: int
    content: dict | None
    change_summary: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


class DocumentTemplateCreate(BaseModel):
    name: str
    content: dict | None = None
    category: str | None = None


class DocumentTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    content: dict | None
    category: str | None
    model_config = {"from_attributes": True}
