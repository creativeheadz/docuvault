import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


# What a box on the map can be. A node backed by a configuration record still
# carries a kind of its own: the record says "Workstation", the map wants an
# icon and a shape, and the two are allowed to disagree.
NODE_KINDS = (
    "internet", "isp", "cloud",
    "firewall", "router", "switch", "access_point",
    "server", "virtual_machine", "nas",
    "workstation", "laptop", "printer", "phone", "camera", "iot", "ups",
    "other",
)

# The medium a connection runs over; drives how the line is drawn.
LINK_KINDS = ("ethernet", "fibre", "wifi", "wan", "vpn", "trunk", "logical")

# An uplink is the one connection that names a node's gateway: source is the
# device, target is what it plugs into. Each node has at most one, and
# following them never loops, so the uplinks form the tree the map lays out
# from. Every other connection is a peer link.
LINK_ROLES = ("uplink", "peer")

ZONE_TONES = ("neutral", "ember", "blue", "green", "warn", "red")


class NetworkMap(TimestampMixin, Base):
    __tablename__ = "network_maps"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    viewport: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Bumped on every graph save; a save carrying an older number is refused
    # rather than silently overwriting a map edited in another tab.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    organization = relationship("Organization", lazy="selectin")
    location = relationship("Location", lazy="selectin")
    nodes = relationship(
        "NetworkMapNode", lazy="selectin", cascade="all, delete-orphan",
        order_by="NetworkMapNode.created_at",
    )
    links = relationship(
        "NetworkMapLink", lazy="selectin", cascade="all, delete-orphan",
        order_by="NetworkMapLink.created_at",
    )
    zones = relationship(
        "NetworkMapZone", lazy="selectin", cascade="all, delete-orphan",
        order_by="NetworkMapZone.created_at",
    )


class NetworkMapNode(TimestampMixin, Base):
    __tablename__ = "network_map_nodes"

    map_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("network_maps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    configuration_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("configurations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="other")
    # Shown instead of the record's name when set; the only name a sketched
    # node (one with no record behind it) has.
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address: Mapped[str | None] = mapped_column(String(100), nullable=True)
    x: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    y: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    functions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class NetworkMapLink(TimestampMixin, Base):
    __tablename__ = "network_map_links"

    map_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("network_maps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("network_map_nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("network_map_nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(10), nullable=False, default="peer")
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="ethernet")
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_port: Mapped[str | None] = mapped_column(String(60), nullable=True)
    target_port: Mapped[str | None] = mapped_column(String(60), nullable=True)
    speed: Mapped[str | None] = mapped_column(String(30), nullable=True)
    vlan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class NetworkMapZone(TimestampMixin, Base):
    __tablename__ = "network_map_zones"

    map_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("network_maps.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    y: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    width: Mapped[float] = mapped_column(Float, nullable=False, default=400)
    height: Mapped[float] = mapped_column(Float, nullable=False, default=260)
    tone: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
