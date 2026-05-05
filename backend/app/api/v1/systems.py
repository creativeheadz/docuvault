import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.system import (
    ChatMessageResponse,
    ChatTurnRequest,
    ChatTurnResponse,
    SystemCreate,
    SystemResponse,
    SystemUpdate,
    ToolEvent,
)
from app.models.system import System
from app.services import system_service
from app.services.anthropic_chat import run_chat_turn

router = APIRouter(prefix="/systems", tags=["systems"])


@router.get("", response_model=list[SystemResponse])
async def list_systems(
    search: str = Query("", max_length=255),
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await system_service.list_systems(db, search=search, include_archived=include_archived)


@router.post("", response_model=SystemResponse, status_code=status.HTTP_201_CREATED)
async def create_system(
    body: SystemCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    data = body.model_dump()
    base_slug = data.get("slug") or system_service.slugify(data["name"])
    data["slug"] = await system_service.ensure_unique_slug(db, base_slug)
    item = System(**data)
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.get("/{system_id}", response_model=SystemResponse)
async def get_system(
    system_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = await system_service.get_system(db, system_id)
    if not item:
        raise HTTPException(status_code=404, detail="System not found")
    return item


@router.put("/{system_id}", response_model=SystemResponse)
async def update_system(
    system_id: uuid.UUID,
    body: SystemUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = await system_service.get_system(db, system_id)
    if not item:
        raise HTTPException(status_code=404, detail="System not found")
    patch = body.model_dump(exclude_unset=True)
    if "name" in patch and "slug" not in patch:
        patch["slug"] = await system_service.ensure_unique_slug(
            db, system_service.slugify(patch["name"]), exclude_id=item.id
        )
    elif "slug" in patch and patch["slug"]:
        patch["slug"] = await system_service.ensure_unique_slug(
            db, system_service.slugify(patch["slug"]), exclude_id=item.id
        )
    for k, v in patch.items():
        setattr(item, k, v)
    await db.flush()
    await db.refresh(item)
    return item


@router.delete("/{system_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_system(
    system_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = await system_service.get_system(db, system_id)
    if not item:
        raise HTTPException(status_code=404, detail="System not found")
    await db.delete(item)


@router.get("/{system_id}/chat", response_model=list[ChatMessageResponse])
async def list_chat_messages(
    system_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = await system_service.get_system(db, system_id)
    if not item:
        raise HTTPException(status_code=404, detail="System not found")
    return await system_service.list_chat_messages(db, system_id)


@router.post("/{system_id}/chat", response_model=ChatTurnResponse)
async def post_chat_turn(
    system_id: uuid.UUID,
    body: ChatTurnRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    system = await system_service.get_system(db, system_id)
    if not system:
        raise HTTPException(status_code=404, detail="System not found")

    history_rows = await system_service.list_chat_messages(db, system_id)
    history = [{"role": r.role, "content": r.content} for r in history_rows]

    try:
        assistant_text, tool_events, new_messages = await run_chat_turn(
            db, system, body.message, history
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    persisted: list = []
    for msg in new_messages:
        row = await system_service.append_chat_message(db, system_id, msg["role"], msg["content"])
        persisted.append(row)

    # Find the first user message and the final assistant message we appended this turn.
    user_msg = next((p for p in persisted if p.role == "user"), persisted[0])
    assistant_msg = next((p for p in reversed(persisted) if p.role == "assistant"), persisted[-1])

    await db.refresh(system)
    return ChatTurnResponse(
        assistant_text=assistant_text or "(no reply)",
        tool_events=[ToolEvent(**t) for t in tool_events],
        system=SystemResponse.model_validate(system),
        user_message=ChatMessageResponse.model_validate(user_msg),
        assistant_message=ChatMessageResponse.model_validate(assistant_msg),
    )
