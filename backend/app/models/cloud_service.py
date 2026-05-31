import uuid
from datetime import datetime, date

from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, Date, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class CloudService(TimestampMixin, Base):
    __tablename__ = "cloud_services"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor: Mapped[str] = mapped_column(String(200), nullable=False)
    service_type: Mapped[str] = mapped_column(String(10), nullable=False, default="SaaS")  # IaaS / PaaS / SaaS
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    business_purpose: Mapped[str] = mapped_column(Text, nullable=False)
    data_classification: Mapped[str] = mapped_column(String(20), nullable=False, default="internal")
    # none / public / internal / confidential / personal (UK GDPR)

    admin_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    user_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mfa_enforced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sso_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    billing_owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    monthly_cost_gbp: Mapped[int | None] = mapped_column(Integer, nullable=True)  # pence

    ce_in_scope: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_reviewed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    review_period_months: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    next_review_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    # active / pending / retired

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", lazy="selectin")
