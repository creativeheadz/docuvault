"""Configuration Cyber Essentials evidence fields

Revision ID: 013
Revises: 012
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("configurations", sa.Column("ce_in_scope", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("configurations", sa.Column("device_role", sa.String(20), nullable=True))
    op.add_column("configurations", sa.Column("software_firewall_on", sa.Boolean(), nullable=True))
    op.add_column("configurations", sa.Column("malware_protection", sa.String(20), nullable=True))
    op.add_column("configurations", sa.Column("os_eol_date", sa.Date(), nullable=True))
    op.add_column("configurations", sa.Column("last_patched_date", sa.Date(), nullable=True))
    op.create_index("ix_configurations_ce_in_scope", "configurations", ["ce_in_scope"])


def downgrade() -> None:
    op.drop_index("ix_configurations_ce_in_scope", table_name="configurations")
    op.drop_column("configurations", "last_patched_date")
    op.drop_column("configurations", "os_eol_date")
    op.drop_column("configurations", "malware_protection")
    op.drop_column("configurations", "software_firewall_on")
    op.drop_column("configurations", "device_role")
    op.drop_column("configurations", "ce_in_scope")
