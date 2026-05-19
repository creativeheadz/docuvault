import uuid
from datetime import datetime

from sqlalchemy import BigInteger, String, Text, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class System(TimestampMixin, Base):
    __tablename__ = "systems"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    short_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    snippets: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    palace_drawer_ids: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="draft", index=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    chat_messages = relationship(
        "SystemChatMessage",
        back_populates="system",
        cascade="all, delete-orphan",
        order_by="SystemChatMessage.seq",
        lazy="selectin",
    )


class SystemChatMessage(TimestampMixin, Base):
    __tablename__ = "system_chat_messages"

    system_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("systems.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Monotonic insert sequence — created_at ties on transaction start time
    # within a single turn, so we order by seq instead.
    seq: Mapped[int] = mapped_column(
        BigInteger,
        server_default=text("nextval('system_chat_messages_seq_seq')"),
        nullable=False,
    )
    # role: user | assistant | tool
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # content blocks as Anthropic-style list (text/tool_use/tool_result blocks)
    content: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    # Anthropic usage stats — only populated on assistant rows.
    # Shape: {input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, model}
    usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    system = relationship("System", back_populates="chat_messages")
