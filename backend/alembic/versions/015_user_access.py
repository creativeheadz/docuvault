"""User access matrix (Cyber Essentials A7)

Revision ID: 015
Revises: 014
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_accesses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),

        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cloud_service_id", UUID(as_uuid=True), sa.ForeignKey("cloud_services.id", ondelete="CASCADE"), nullable=True),
        sa.Column("configuration_id", UUID(as_uuid=True), sa.ForeignKey("configurations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("custom_system_label", sa.String(200), nullable=True),

        sa.Column("privilege_level", sa.String(20), nullable=False, server_default="standard"),
        sa.Column("person_category", sa.String(20), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),

        sa.Column("access_granted_date", sa.Date(), nullable=True),
        sa.Column("last_reviewed_date", sa.Date(), nullable=True),
        sa.Column("review_period_months", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("next_review_date", sa.Date(), nullable=False),

        sa.Column("notes", sa.Text(), nullable=True),

        sa.CheckConstraint(
            "(cloud_service_id IS NOT NULL)::int + (configuration_id IS NOT NULL)::int + (custom_system_label IS NOT NULL)::int = 1",
            name="ck_user_accesses_single_target",
        ),
    )
    op.create_index("ix_user_accesses_contact_id", "user_accesses", ["contact_id"])
    op.create_index("ix_user_accesses_cloud_service_id", "user_accesses", ["cloud_service_id"])
    op.create_index("ix_user_accesses_configuration_id", "user_accesses", ["configuration_id"])
    op.create_index("ix_user_accesses_is_active", "user_accesses", ["is_active"])
    op.create_index("ix_user_accesses_next_review_date", "user_accesses", ["next_review_date"])


def downgrade() -> None:
    op.drop_index("ix_user_accesses_next_review_date", table_name="user_accesses")
    op.drop_index("ix_user_accesses_is_active", table_name="user_accesses")
    op.drop_index("ix_user_accesses_configuration_id", table_name="user_accesses")
    op.drop_index("ix_user_accesses_cloud_service_id", table_name="user_accesses")
    op.drop_index("ix_user_accesses_contact_id", table_name="user_accesses")
    op.drop_table("user_accesses")
