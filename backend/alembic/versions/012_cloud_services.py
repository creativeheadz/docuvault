"""Cloud Services register (Cyber Essentials v3.3)

Revision ID: 012
Revises: 011
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cloud_services",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),

        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("vendor", sa.String(200), nullable=False),
        sa.Column("service_type", sa.String(10), nullable=False, server_default="SaaS"),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("business_purpose", sa.Text(), nullable=False),
        sa.Column("data_classification", sa.String(20), nullable=False, server_default="internal"),

        sa.Column("admin_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("user_count", sa.Integer(), nullable=True),
        sa.Column("mfa_enforced", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sso_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),

        sa.Column("billing_owner", sa.String(200), nullable=True),
        sa.Column("monthly_cost_gbp", sa.Integer(), nullable=True),

        sa.Column("ce_in_scope", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_reviewed_date", sa.Date(), nullable=True),
        sa.Column("review_period_months", sa.Integer(), nullable=False, server_default="12"),
        sa.Column("next_review_date", sa.Date(), nullable=False),

        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_cloud_services_organization_id", "cloud_services", ["organization_id"])
    op.create_index("ix_cloud_services_status", "cloud_services", ["status"])
    op.create_index("ix_cloud_services_next_review_date", "cloud_services", ["next_review_date"])


def downgrade() -> None:
    op.drop_index("ix_cloud_services_next_review_date", table_name="cloud_services")
    op.drop_index("ix_cloud_services_status", table_name="cloud_services")
    op.drop_index("ix_cloud_services_organization_id", table_name="cloud_services")
    op.drop_table("cloud_services")
