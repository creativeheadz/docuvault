import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class System(TimestampMixin, Base):
    """Anything worth documenting: a machine on a client's network, a VM, a
    switch, or a platform or vendor that belongs to nobody's network.

    One record carries what used to be three: inventory (synced in from
    MeshCentral, pushed by Wegweiser, or typed), the chat-written
    documentation, and the Cyber Essentials evidence. A system without an organisation is
    estate-wide; one with an organisation can be placed on its maps.
    """
    __tablename__ = "systems"

    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # What it is, in the operator's words: Workstation, Firewall, Platform, Vendor...
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="active", index=True)
    # Where the record came from: manual, meshcentral, wegweiser, map, csv,
    # or another importer's name. Set once, by whatever created it; a sync
    # that later links an existing system shows in its own columns instead.
    source: Mapped[str] = mapped_column(String(30), nullable=False, server_default="manual", index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- Documentation (written by hand or by the chat assistant) ---
    short_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    snippets: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    palace_drawer_ids: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # --- Inventory ---
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    operating_system: Mapped[str | None] = mapped_column(String(255), nullable=True)
    os_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warranty_expiration: Mapped[date | None] = mapped_column(Date, nullable=True)

    # --- MeshCentral (owned by meshcentral_service's sync) ---
    mesh_node_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    mesh_agent_connected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    mesh_last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mesh_extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- Wegweiser (owned by the inventory push, wegweiser_push.py) ---
    wegweiser_device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    wegweiser_online: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    wegweiser_last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    wegweiser_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # health_score, agent_version, group, url, mac_addresses, system_uuid
    wegweiser_extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- Cyber Essentials evidence (advisory metadata, not enforced state) ---
    ce_in_scope: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    device_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # employee / admin / byod / server / network
    software_firewall_on: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    malware_protection: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # defender / allowlist / thirdparty / none
    os_eol_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_patched_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # passive_deletes: deleting an organisation lets the database cascade
    # remove its systems, rather than the ORM orphaning them as estate-wide.
    organization = relationship(
        "Organization", backref=backref("systems", passive_deletes=True), lazy="selectin"
    )
    chat_messages = relationship(
        "SystemChatMessage",
        back_populates="system",
        cascade="all, delete-orphan",
        order_by="SystemChatMessage.seq",
        # Read through system_service.list_chat_messages; listing systems
        # should not drag every conversation along, and the database
        # cascade removes them with the system.
        lazy="noload",
        passive_deletes=True,
    )


class SystemChatMessage(TimestampMixin, Base):
    __tablename__ = "system_chat_messages"

    system_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("systems.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Monotonic insert sequence — created_at ties on transaction start time
    # within a single turn, so we order by seq instead.
    seq: Mapped[int] = mapped_column(
        BigInteger,
        server_default=text("nextval('system_chat_messages_seq_seq')"),
        nullable=False,
    )
    # role: user | assistant | tool
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # content blocks as Anthropic-style list (text/tool_use/tool_result blocks)
    content: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    # Anthropic usage stats — only populated on assistant rows.
    # Shape: {input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, model}
    usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    system = relationship("System", back_populates="chat_messages")
