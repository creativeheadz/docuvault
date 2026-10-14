"""Network maps: hand-drawn topology over the configuration records

Revision ID: 019
Revises: 018
Create Date: 2026-10-14 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _stamps() -> list[sa.Column]:
    return [
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "network_maps",
        *_stamps(),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("viewport", JSONB(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_network_maps_organization_id", "network_maps", ["organization_id"])
    op.create_index("ix_network_maps_location_id", "network_maps", ["location_id"])

    op.create_table(
        "network_map_nodes",
        *_stamps(),
        sa.Column("map_id", UUID(as_uuid=True), sa.ForeignKey("network_maps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("configuration_id", UUID(as_uuid=True), sa.ForeignKey("configurations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False, server_default="other"),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("address", sa.String(100), nullable=True),
        sa.Column("x", sa.Float(), nullable=False, server_default="0"),
        sa.Column("y", sa.Float(), nullable=False, server_default="0"),
        sa.Column("functions", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_network_map_nodes_map_id", "network_map_nodes", ["map_id"])
    op.create_index("ix_network_map_nodes_configuration_id", "network_map_nodes", ["configuration_id"])

    op.create_table(
        "network_map_links",
        *_stamps(),
        sa.Column("map_id", UUID(as_uuid=True), sa.ForeignKey("network_maps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_node_id", UUID(as_uuid=True), sa.ForeignKey("network_map_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_node_id", UUID(as_uuid=True), sa.ForeignKey("network_map_nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(10), nullable=False, server_default="peer"),
        sa.Column("kind", sa.String(20), nullable=False, server_default="ethernet"),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("source_port", sa.String(60), nullable=True),
        sa.Column("target_port", sa.String(60), nullable=True),
        sa.Column("speed", sa.String(30), nullable=True),
        sa.Column("vlan", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_network_map_links_map_id", "network_map_links", ["map_id"])
    op.create_index("ix_network_map_links_source_node_id", "network_map_links", ["source_node_id"])
    op.create_index("ix_network_map_links_target_node_id", "network_map_links", ["target_node_id"])

    op.create_table(
        "network_map_zones",
        *_stamps(),
        sa.Column("map_id", UUID(as_uuid=True), sa.ForeignKey("network_maps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("x", sa.Float(), nullable=False, server_default="0"),
        sa.Column("y", sa.Float(), nullable=False, server_default="0"),
        sa.Column("width", sa.Float(), nullable=False, server_default="400"),
        sa.Column("height", sa.Float(), nullable=False, server_default="260"),
        sa.Column("tone", sa.String(20), nullable=False, server_default="neutral"),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_network_map_zones_map_id", "network_map_zones", ["map_id"])


def downgrade() -> None:
    op.drop_index("ix_network_map_zones_map_id", table_name="network_map_zones")
    op.drop_table("network_map_zones")
    op.drop_index("ix_network_map_links_target_node_id", table_name="network_map_links")
    op.drop_index("ix_network_map_links_source_node_id", table_name="network_map_links")
    op.drop_index("ix_network_map_links_map_id", table_name="network_map_links")
    op.drop_table("network_map_links")
    op.drop_index("ix_network_map_nodes_configuration_id", table_name="network_map_nodes")
    op.drop_index("ix_network_map_nodes_map_id", table_name="network_map_nodes")
    op.drop_table("network_map_nodes")
    op.drop_index("ix_network_maps_location_id", table_name="network_maps")
    op.drop_index("ix_network_maps_organization_id", table_name="network_maps")
    op.drop_table("network_maps")
