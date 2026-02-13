import uuid

from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Runbook(TimestampMixin, Base):
    __tablename__ = "runbooks"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", backref="runbooks", lazy="selectin")
    steps = relationship("RunbookStep", back_populates="runbook", lazy="selectin", cascade="all, delete-orphan", order_by="RunbookStep.step_number")


class RunbookStep(TimestampMixin, Base):
    __tablename__ = "runbook_steps"

    runbook_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runbooks.id", ondelete="CASCADE"), nullable=False, index=True)
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    runbook = relationship("Runbook", back_populates="steps")
