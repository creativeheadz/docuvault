import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.relationship import Relationship
from app.models.user import User

router = APIRouter(prefix="/relationships", tags=["relationships"])


# --- Schemas ---

class RelationshipCreate(BaseModel):
    source_type: str
    source_id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    relationship_type: str


class RelationshipResponse(BaseModel):
    id: uuid.UUID
    source_type: str
    source_id: uuid.UUID
    target_type: str
    target_id: uuid.UUID
    relationship_type: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.get("", response_model=list[RelationshipResponse])
async def list_relationships(
    source_type: str | None = Query(None),
    source_id: uuid.UUID | None = Query(None),
    target_type: str | None = Query(None),
    target_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Relationship)
    if source_type:
        query = query.where(Relationship.source_type == source_type)
    if source_id:
        query = query.where(Relationship.source_id == source_id)
    if target_type:
        query = query.where(Relationship.target_type == target_type)
    if target_id:
        query = query.where(Relationship.target_id == target_id)
    items = (
        await db.execute(
            query.order_by(Relationship.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return items


@router.post("", response_model=RelationshipResponse, status_code=status.HTTP_201_CREATED)
async def create_relationship(
    body: RelationshipCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rel = Relationship(**body.model_dump())
    db.add(rel)
    await db.flush()
    await db.refresh(rel)
    return rel


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_relationship(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Relationship).where(Relationship.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Relationship not found")
    await db.delete(item)
