import uuid
from pydantic import BaseModel


class IDResponse(BaseModel):
    id: uuid.UUID


class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 25


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int


class MessageResponse(BaseModel):
    message: str
