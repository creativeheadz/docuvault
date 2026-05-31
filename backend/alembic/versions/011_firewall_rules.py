"""Firewall rule register (Cyber Essentials A4)

Revision ID: 011
Revises: 010
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "firewall_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("configuration_id", UUID(as_uuid=True), sa.ForeignKey("configurations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False, server_default="inbound"),
        sa.Column("external_port", sa.String(50), nullable=False),
        sa.Column("internal_host", sa.String(255), nullable=False),
        sa.Column("internal_port", sa.String(50), nullable=True),
        sa.Column("protocol", sa.String(10), nullable=False, server_default="TCP"),
        sa.Column("business_need", sa.Text(), nullable=False),
        sa.Column("approved_by", sa.String(200), nullable=False),
        sa.Column("approved_date", sa.Date(), nullable=False),
        sa.Column("review_period_months", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("next_review_date", sa.Date(), nullable=False),
        sa.Column("last_reviewed_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("removed_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_firewall_rules_organization_id", "firewall_rules", ["organization_id"])
    op.create_index("ix_firewall_rules_configuration_id", "firewall_rules", ["configuration_id"])
    op.create_index("ix_firewall_rules_status", "firewall_rules", ["status"])
    op.create_index("ix_firewall_rules_next_review_date", "firewall_rules", ["next_review_date"])


def downgrade() -> None:
    op.drop_index("ix_firewall_rules_next_review_date", table_name="firewall_rules")
    op.drop_index("ix_firewall_rules_status", table_name="firewall_rules")
    op.drop_index("ix_firewall_rules_configuration_id", table_name="firewall_rules")
    op.drop_index("ix_firewall_rules_organization_id", table_name="firewall_rules")
    op.drop_table("firewall_rules")
