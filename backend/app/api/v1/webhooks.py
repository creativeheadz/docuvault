import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.webhook import Webhook
from app.models.user import User

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# --- Schemas ---

class WebhookCreate(BaseModel):
    name: str
    url: str
    events: list | None = None
    is_active: bool = True
    secret: str | None = None


class WebhookUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    events: list | None = None
    is_active: bool | None = None
    secret: str | None = None


class WebhookResponse(BaseModel):
    id: uuid.UUID
    name: str
    url: str
    events: list | None = None
    is_active: bool
    secret: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Webhook)
    if is_active is not None:
        query = query.where(Webhook.is_active == is_active)
    items = (
        await db.execute(
            query.order_by(Webhook.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return items


@router.post("", response_model=WebhookResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    body: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = Webhook(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=WebhookResponse)
async def get_webhook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Webhook).where(Webhook.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return item


@router.put("/{item_id}", response_model=WebhookResponse)
async def update_webhook(
    item_id: uuid.UUID,
    body: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Webhook).where(Webhook.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Webhook not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Webhook).where(Webhook.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.delete(item)
