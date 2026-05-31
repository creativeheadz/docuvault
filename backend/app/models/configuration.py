import uuid
from datetime import datetime, date

from sqlalchemy import String, Text, Date, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Configuration(TimestampMixin, Base):
    __tablename__ = "configurations"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    configuration_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    operating_system: Mapped[str | None] = mapped_column(String(255), nullable=True)
    os_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warranty_expiration: Mapped[str | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[str | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mesh_node_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    mesh_agent_connected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    mesh_last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mesh_extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Cyber Essentials evidence fields (see /firewall-rules + /cloud-services for the
    # broader compliance surface). Values are advisory metadata, not enforced state.
    ce_in_scope: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    device_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # employee / admin / byod / server / network
    software_firewall_on: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    malware_protection: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # defender / allowlist / thirdparty / none
    os_eol_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_patched_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    organization = relationship("Organization", backref="configurations", lazy="selectin")
