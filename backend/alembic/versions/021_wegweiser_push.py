"""Systems Wegweiser pushed in, and what it last said about them

Revision ID: 021
Revises: 020
Create Date: 2026-10-15 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("systems", sa.Column("wegweiser_device_id", sa.String(64), nullable=True))
    op.add_column("systems", sa.Column("wegweiser_online", sa.Boolean(), nullable=True))
    op.add_column("systems", sa.Column("wegweiser_last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("systems", sa.Column("wegweiser_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("systems", sa.Column("wegweiser_extra", JSONB(), nullable=True))
    op.create_index("ix_systems_wegweiser_device_id", "systems", ["wegweiser_device_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_systems_wegweiser_device_id", table_name="systems")
    for col in ("wegweiser_extra", "wegweiser_synced_at", "wegweiser_last_seen_at",
                "wegweiser_online", "wegweiser_device_id"):
        op.drop_column("systems", col)
