import uuid
from datetime import datetime
from pydantic import BaseModel


class FlexibleAssetFieldSchema(BaseModel):
    id: uuid.UUID | None = None
    name: str
    field_type: str
    section_id: uuid.UUID | None = None
    hint: str | None = None
    required: bool = False
    options: dict | None = None
    sort_order: int = 0


class FlexibleAssetSectionSchema(BaseModel):
    id: uuid.UUID | None = None
    name: str
    sort_order: int = 0


class FlexibleAssetTypeCreate(BaseModel):
    name: str
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_enabled: bool = True
    sections: list[FlexibleAssetSectionSchema] = []
    fields: list[FlexibleAssetFieldSchema] = []


class FlexibleAssetTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    color: str | None = None
    is_enabled: bool | None = None
    sections: list[FlexibleAssetSectionSchema] | None = None
    fields: list[FlexibleAssetFieldSchema] | None = None


class FlexibleAssetFieldResponse(BaseModel):
    id: uuid.UUID
    asset_type_id: uuid.UUID
    section_id: uuid.UUID | None
    name: str
    field_type: str
    hint: str | None
    required: bool
    options: dict | None
    sort_order: int
    model_config = {"from_attributes": True}


class FlexibleAssetSectionResponse(BaseModel):
    id: uuid.UUID
    asset_type_id: uuid.UUID
    name: str
    sort_order: int
    fields: list[FlexibleAssetFieldResponse] = []
    model_config = {"from_attributes": True}


class FlexibleAssetTypeResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    icon: str | None
    color: str | None
    is_enabled: bool
    sections: list[FlexibleAssetSectionResponse] = []
    fields: list[FlexibleAssetFieldResponse] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class FlexibleAssetCreate(BaseModel):
    asset_type_id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    field_values: dict = {}


class FlexibleAssetUpdate(BaseModel):
    name: str | None = None
    field_values: dict | None = None


class FlexibleAssetResponse(BaseModel):
    id: uuid.UUID
    asset_type_id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    field_values: dict
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
