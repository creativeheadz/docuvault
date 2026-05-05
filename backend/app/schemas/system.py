import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class SystemCreate(BaseModel):
    name: str
    slug: str | None = None
    category: str | None = None
    short_description: str | None = None
    body: str | None = None
    tags: list[str] = Field(default_factory=list)
    snippets: dict[str, Any] = Field(default_factory=dict)
    palace_drawer_ids: list[str] = Field(default_factory=list)
    status: str = "draft"
    color: str | None = None
    icon: str | None = None


class SystemUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    category: str | None = None
    short_description: str | None = None
    body: str | None = None
    tags: list[str] | None = None
    snippets: dict[str, Any] | None = None
    palace_drawer_ids: list[str] | None = None
    status: str | None = None
    color: str | None = None
    icon: str | None = None


class SystemResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    category: str | None
    short_description: str | None
    body: str | None
    tags: list[str]
    snippets: dict[str, Any]
    palace_drawer_ids: list[str]
    status: str
    color: str | None
    icon: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None

    model_config = {"from_attributes": True}


class ChatMessageBlock(BaseModel):
    """Anthropic-style content block (text / tool_use / tool_result)."""

    type: str
    # text block
    text: str | None = None
    # tool_use block
    id: str | None = None
    name: str | None = None
    input: dict[str, Any] | None = None
    # tool_result block
    tool_use_id: str | None = None
    content: Any | None = None


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    system_id: uuid.UUID
    role: Literal["user", "assistant"]
    content: list[dict[str, Any]]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatTurnRequest(BaseModel):
    message: str


class ToolEvent(BaseModel):
    name: str
    input: dict[str, Any]
    output: Any


class ChatTurnResponse(BaseModel):
    assistant_text: str
    tool_events: list[ToolEvent]
    system: SystemResponse
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
