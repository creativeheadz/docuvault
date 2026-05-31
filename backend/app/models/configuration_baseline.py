import uuid
from datetime import date

from sqlalchemy import Integer, Text, ForeignKey, Date, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ConfigurationBaseline(TimestampMixin, Base):
    __tablename__ = "configuration_baselines"
    __table_args__ = (
        UniqueConstraint("configuration_id", "checklist_id", name="uq_configuration_baselines_config_checklist"),
    )

    configuration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("configurations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    checklist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    last_verified_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    review_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    next_review_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    configuration = relationship("Configuration", lazy="selectin")
    checklist = relationship("Checklist", lazy="selectin")
