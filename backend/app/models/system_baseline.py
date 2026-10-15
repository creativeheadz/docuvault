import uuid
from datetime import date

from sqlalchemy import Integer, Text, ForeignKey, Date, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SystemBaseline(TimestampMixin, Base):
    __tablename__ = "system_baselines"
    __table_args__ = (
        UniqueConstraint("system_id", "checklist_id", name="uq_system_baselines_system_checklist"),
    )

    system_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("systems.id", ondelete="CASCADE"), nullable=False, index=True
    )
    checklist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    last_verified_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    review_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    next_review_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    system = relationship("System", lazy="selectin")
    checklist = relationship("Checklist", lazy="selectin")
