import uuid

from sqlalchemy import String, Text, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Domain(TimestampMixin, Base):
    __tablename__ = "domains"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    domain_name: Mapped[str] = mapped_column(String(255), nullable=False)
    registrar: Mapped[str | None] = mapped_column(String(255), nullable=True)
    registration_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    expiration_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dns_records: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", backref="domains", lazy="selectin")
