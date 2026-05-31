import uuid
from datetime import date

from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, Date, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserAccess(TimestampMixin, Base):
    """Records that a contact has access to a system (CE A7 evidence).

    The system can be a tracked cloud service, a configuration (device/server),
    or a free-text custom system that isn't modelled yet. Exactly one of the
    three system fields should be populated.
    """
    __tablename__ = "user_accesses"
    __table_args__ = (
        CheckConstraint(
            "(cloud_service_id IS NOT NULL)::int + (configuration_id IS NOT NULL)::int + (custom_system_label IS NOT NULL)::int = 1",
            name="ck_user_accesses_single_target",
        ),
    )

    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True
    )

    cloud_service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cloud_services.id", ondelete="CASCADE"), nullable=True, index=True
    )
    configuration_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("configurations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    custom_system_label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    privilege_level: Mapped[str] = mapped_column(String(20), nullable=False, default="standard")
    # standard / admin / owner

    person_category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # employee / contractor / msp / vendor / customer

    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)

    access_granted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_reviewed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    review_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=6)
    next_review_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    contact = relationship("Contact", lazy="selectin")
    cloud_service = relationship("CloudService", lazy="selectin")
    configuration = relationship("Configuration", lazy="selectin")
