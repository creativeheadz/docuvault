"""Baselines: promote checklists, bind to configurations

Revision ID: 014
Revises: 013
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("checklists", sa.Column("is_baseline", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_index("ix_checklists_is_baseline", "checklists", ["is_baseline"])

    op.create_table(
        "configuration_baselines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("configuration_id", UUID(as_uuid=True), sa.ForeignKey("configurations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("checklist_id", UUID(as_uuid=True), sa.ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("last_verified_date", sa.Date(), nullable=True),
        sa.Column("review_period_months", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("next_review_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("configuration_id", "checklist_id", name="uq_configuration_baselines_config_checklist"),
    )
    op.create_index("ix_configuration_baselines_configuration_id", "configuration_baselines", ["configuration_id"])
    op.create_index("ix_configuration_baselines_checklist_id", "configuration_baselines", ["checklist_id"])
    op.create_index("ix_configuration_baselines_next_review_date", "configuration_baselines", ["next_review_date"])


def downgrade() -> None:
    op.drop_index("ix_configuration_baselines_next_review_date", table_name="configuration_baselines")
    op.drop_index("ix_configuration_baselines_checklist_id", table_name="configuration_baselines")
    op.drop_index("ix_configuration_baselines_configuration_id", table_name="configuration_baselines")
    op.drop_table("configuration_baselines")
    op.drop_index("ix_checklists_is_baseline", table_name="checklists")
    op.drop_column("checklists", "is_baseline")
