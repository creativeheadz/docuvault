import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.runbook import Runbook, RunbookStep
from app.models.user import User

router = APIRouter(prefix="/runbooks", tags=["runbooks"])


# --- Schemas ---

class RunbookStepCreate(BaseModel):
    step_number: int
    title: str
    content: dict | None = None
    is_completed: bool = False


class RunbookStepUpdate(BaseModel):
    step_number: int | None = None
    title: str | None = None
    content: dict | None = None
    is_completed: bool | None = None


class RunbookStepResponse(BaseModel):
    id: uuid.UUID
    runbook_id: uuid.UUID
    step_number: int
    title: str
    content: dict | None = None
    is_completed: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class RunbookCreate(BaseModel):
    organization_id: uuid.UUID
    name: str
    description: str | None = None


class RunbookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class RunbookResponse(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: str | None = None
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    steps: list[RunbookStepResponse] = []

    model_config = {"from_attributes": True}


# --- Runbook Endpoints ---

@router.get("", response_model=list[RunbookResponse])
async def list_runbooks(
    organization_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Runbook).where(Runbook.archived_at.is_(None))
    if organization_id:
        query = query.where(Runbook.organization_id == organization_id)
    items = (
        await db.execute(
            query.order_by(Runbook.name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return items


@router.post("", response_model=RunbookResponse, status_code=status.HTTP_201_CREATED)
async def create_runbook(
    body: RunbookCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = Runbook(**body.model_dump())
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=RunbookResponse)
async def get_runbook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Runbook).where(Runbook.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Runbook not found")
    return item


@router.put("/{item_id}", response_model=RunbookResponse)
async def update_runbook(
    item_id: uuid.UUID,
    body: RunbookUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Runbook).where(Runbook.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Runbook not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_runbook(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Runbook).where(Runbook.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Runbook not found")
    await db.delete(item)


# --- Runbook Step Endpoints ---

@router.post("/{runbook_id}/steps", response_model=RunbookStepResponse, status_code=status.HTTP_201_CREATED)
async def create_runbook_step(
    runbook_id: uuid.UUID,
    body: RunbookStepCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Runbook).where(Runbook.id == runbook_id))
    runbook = result.scalar_one_or_none()
    if not runbook:
        raise HTTPException(status_code=404, detail="Runbook not found")
    step = RunbookStep(runbook_id=runbook_id, **body.model_dump())
    db.add(step)
    await db.flush()
    await db.refresh(step)
    return step


@router.put("/{runbook_id}/steps/{step_id}", response_model=RunbookStepResponse)
async def update_runbook_step(
    runbook_id: uuid.UUID,
    step_id: uuid.UUID,
    body: RunbookStepUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RunbookStep).where(RunbookStep.id == step_id, RunbookStep.runbook_id == runbook_id)
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(status_code=404, detail="Runbook step not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(step, field, value)
    await db.flush()
    await db.refresh(step)
    return step


@router.delete("/{runbook_id}/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_runbook_step(
    runbook_id: uuid.UUID,
    step_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RunbookStep).where(RunbookStep.id == step_id, RunbookStep.runbook_id == runbook_id)
    )
    step = result.scalar_one_or_none()
    if not step:
        raise HTTPException(status_code=404, detail="Runbook step not found")
    await db.delete(step)
