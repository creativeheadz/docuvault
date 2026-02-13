import uuid

from sqlalchemy import String, Text, Boolean, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Checklist(TimestampMixin, Base):
    __tablename__ = "checklists"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", backref="checklists", lazy="selectin")
    items = relationship("ChecklistItem", back_populates="checklist", lazy="selectin", cascade="all, delete-orphan", order_by="ChecklistItem.sort_order")


class ChecklistItem(TimestampMixin, Base):
    __tablename__ = "checklist_items"

    checklist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("checklist_items.id", ondelete="CASCADE"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    checklist = relationship("Checklist", back_populates="items")
    parent = relationship("ChecklistItem", remote_side="ChecklistItem.id", backref="children", lazy="selectin")
