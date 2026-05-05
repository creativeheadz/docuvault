import uuid
from datetime import datetime

from sqlalchemy import Integer, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SSLCertificate(TimestampMixin, Base):
    __tablename__ = "ssl_certificates"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    common_name: Mapped[str] = mapped_column(String(255), nullable=False)
    issuer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issued_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    expiration_date: Mapped[str | None] = mapped_column(Date, nullable=True)
    sans: Mapped[list | None] = mapped_column(ARRAY(String), nullable=True)
    key_algorithm: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Live-probe metadata (filled by POST /ssl-certificates/{id}/probe)
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    subject_cn: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signature_algorithm: Mapped[str | None] = mapped_column(String(100), nullable=True)
    key_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_probed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", backref="ssl_certificates", lazy="selectin")
