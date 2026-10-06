"""Tasks: projects, tasks and subtasks, optionally pinned to an organisation.

Two kinds of caller. A signed-in person, through `get_current_user` like every
other resource. And, since 2026-10-06, a machine holding an `ApiToken` with
the `write:tasks` scope: a coding assistant keeping a product roadmap here
needs to add and move tasks without a person's session, and must never get
anything else. The second path is the only reason this router differs from
its neighbours; see `task_actor` for how the two are told apart and what a
key is allowed to see.
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_auth import assert_scope, authenticate_token
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.api_token import ApiToken, SCOPE_WRITE_TASKS
from app.models.task import Task
from app.models.user import User

router = APIRouter(prefix="/tasks", tags=["tasks"])


VALID_STATUSES = {"idea", "todo", "in_progress", "blocked", "done", "archived"}
VALID_PRIORITIES = {"low", "med", "high"}


# --- Who is asking ---

@dataclass
class TaskActor:
    """The caller, resolved: a person or a key, never both.

    A person sees every task, as before. A key sees what its organisation
    narrowing allows: everything when the key was minted without one, and
    otherwise only tasks that belong to one of its organisations. A task that
    belongs to no organisation is outside every narrowed key's view, so a key
    minted for one product's roadmap cannot stray into the general list.
    """
    user: User | None = None
    token: ApiToken | None = None

    @property
    def narrowed_to(self) -> list[uuid.UUID] | None:
        """The organisations this caller is confined to, or None for all."""
        if self.token is None or not self.token.organization_ids:
            return None
        return [uuid.UUID(str(o)) for o in self.token.organization_ids]

    def allows_organization(self, organization_id) -> bool:
        narrowed = self.narrowed_to
        if narrowed is None:
            return True
        if organization_id is None:
            return False
        return uuid.UUID(str(organization_id)) in narrowed

    def may_see(self, task: Task) -> bool:
        return self.allows_organization(task.organization_id)


async def task_actor(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> TaskActor:
    """Resolve the caller from whichever credential the request carries.

    The presence of `X-API-Key` decides which path is taken; a request that
    also carries a user session is refused outright rather than having one
    credential quietly win, because that ambiguity is exactly how a weaker
    credential ends up accepted where the stronger one was meant.
    """
    if x_api_key is None:
        return TaskActor(user=await get_current_user(request, db))
    if request.headers.get("Authorization") or request.cookies.get("access_token"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Send either an API key or a user session, not both")
    token = await authenticate_token(request, x_api_key, db)
    assert_scope(token, SCOPE_WRITE_TASKS)
    return TaskActor(token=token)


# --- Schemas ---

class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    parent_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    status: str = "todo"
    priority: str | None = None
    due_date: datetime | None = None
    position: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    parent_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    status: str | None = None
    priority: str | None = None
    due_date: datetime | None = None
    position: int | None = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    organization_id: uuid.UUID | None
    title: str
    description: str | None
    status: str
    priority: str | None
    due_date: datetime | None
    position: int
    completed_at: datetime | None
    archived_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    child_count: int = 0

    model_config = {"from_attributes": True}


def _validate_status(value: str) -> None:
    if value not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {sorted(VALID_STATUSES)}")


def _validate_priority(value: str | None) -> None:
    if value is not None and value not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority. Must be one of: {sorted(VALID_PRIORITIES)} or null")


def _assert_may_use_organization(actor: TaskActor, organization_id) -> None:
    """404, not 403: an organisation outside a key's narrowing does not exist
    as far as that key is concerned, and saying otherwise is a disclosure."""
    if not actor.allows_organization(organization_id):
        raise HTTPException(status_code=404, detail="No such organisation")


async def _visible_task(db: AsyncSession, actor: TaskActor, task_id: uuid.UUID) -> Task:
    item = (await db.execute(select(Task).where(Task.id == task_id))).scalar_one_or_none()
    if not item or not actor.may_see(item):
        raise HTTPException(status_code=404, detail="Task not found")
    return item


async def _visible_parent(db: AsyncSession, actor: TaskActor, parent_id: uuid.UUID) -> Task:
    parent = (await db.execute(select(Task).where(Task.id == parent_id))).scalar_one_or_none()
    if not parent or not actor.may_see(parent):
        raise HTTPException(status_code=400, detail="Parent task not found")
    return parent


async def _attach_child_counts(db: AsyncSession, items: list[Task]) -> list[TaskResponse]:
    if not items:
        return []
    ids = [t.id for t in items]
    rows = (await db.execute(
        select(Task.parent_id, func.count(Task.id))
        .where(Task.parent_id.in_(ids))
        .group_by(Task.parent_id)
    )).all()
    counts = {pid: c for pid, c in rows}
    out: list[TaskResponse] = []
    for t in items:
        resp = TaskResponse.model_validate(t)
        resp.child_count = counts.get(t.id, 0)
        out.append(resp)
    return out


# --- Endpoints ---

@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    organization_id: uuid.UUID | None = Query(None),
    parent_id: uuid.UUID | None = Query(None),
    root_only: bool = Query(False, description="Only return top-level tasks (parent_id IS NULL)"),
    status_filter: str | None = Query(None, alias="status"),
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    actor: TaskActor = Depends(task_actor),
):
    query = select(Task)
    narrowed = actor.narrowed_to
    if narrowed is not None:
        query = query.where(Task.organization_id.in_(narrowed))
    if not include_archived:
        query = query.where(Task.archived_at.is_(None))
    if organization_id is not None:
        query = query.where(Task.organization_id == organization_id)
    if root_only:
        query = query.where(Task.parent_id.is_(None))
    elif parent_id is not None:
        query = query.where(Task.parent_id == parent_id)
    if status_filter:
        query = query.where(Task.status == status_filter)
    query = query.order_by(Task.position, Task.created_at)
    items = (await db.execute(query)).scalars().all()
    return await _attach_child_counts(db, list(items))


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    db: AsyncSession = Depends(get_db),
    actor: TaskActor = Depends(task_actor),
):
    _validate_status(body.status)
    _validate_priority(body.priority)
    _assert_may_use_organization(actor, body.organization_id)

    if body.parent_id is not None:
        await _visible_parent(db, actor, body.parent_id)

    data = body.model_dump()
    if data.get("position") is None:
        max_pos = (await db.execute(
            select(func.coalesce(func.max(Task.position), -1))
            .where(Task.parent_id.is_(body.parent_id) if body.parent_id is None else Task.parent_id == body.parent_id)
        )).scalar_one()
        data["position"] = (max_pos or -1) + 1

    item = Task(**data)
    if item.status == "done":
        item.completed_at = datetime.now(timezone.utc)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    resp = TaskResponse.model_validate(item)
    return resp


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: TaskActor = Depends(task_actor),
):
    item = await _visible_task(db, actor, task_id)
    out = await _attach_child_counts(db, [item])
    return out[0]


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    actor: TaskActor = Depends(task_actor),
):
    item = await _visible_task(db, actor, task_id)

    updates = body.model_dump(exclude_unset=True)

    if "status" in updates and updates["status"] is not None:
        _validate_status(updates["status"])
    if "priority" in updates:
        _validate_priority(updates["priority"])
    if "organization_id" in updates:
        _assert_may_use_organization(actor, updates["organization_id"])
    if "parent_id" in updates and updates["parent_id"] is not None:
        if updates["parent_id"] == item.id:
            raise HTTPException(status_code=400, detail="Task cannot be its own parent")
        await _visible_parent(db, actor, updates["parent_id"])

    prev_status = item.status
    for field, value in updates.items():
        setattr(item, field, value)

    new_status = updates.get("status", prev_status)
    if new_status == "done" and prev_status != "done":
        item.completed_at = datetime.now(timezone.utc)
    elif new_status != "done" and prev_status == "done":
        item.completed_at = None
    if new_status == "archived" and item.archived_at is None:
        item.archived_at = datetime.now(timezone.utc)
    elif new_status != "archived" and item.archived_at is not None:
        item.archived_at = None

    await db.flush()
    await db.refresh(item)
    out = await _attach_child_counts(db, [item])
    return out[0]


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: TaskActor = Depends(task_actor),
):
    await _visible_task(db, actor, task_id)
    await db.execute(text("DELETE FROM tasks WHERE id = :tid"), {"tid": task_id})
