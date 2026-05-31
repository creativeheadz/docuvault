import uuid
from datetime import datetime, date

from sqlalchemy import String, Text, Integer, ForeignKey, Date, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class FirewallRule(TimestampMixin, Base):
    __tablename__ = "firewall_rules"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    configuration_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("configurations.id", ondelete="SET NULL"), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False, default="inbound")
    external_port: Mapped[str] = mapped_column(String(50), nullable=False)
    internal_host: Mapped[str] = mapped_column(String(255), nullable=False)
    internal_port: Mapped[str | None] = mapped_column(String(50), nullable=True)
    protocol: Mapped[str] = mapped_column(String(10), nullable=False, default="TCP")

    business_need: Mapped[str] = mapped_column(Text, nullable=False)
    approved_by: Mapped[str] = mapped_column(String(200), nullable=False)
    approved_date: Mapped[date] = mapped_column(Date, nullable=False)
    review_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    next_review_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    last_reviewed_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    removed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", lazy="selectin")
    configuration = relationship("Configuration", lazy="selectin")
