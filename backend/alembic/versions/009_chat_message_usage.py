"""Add usage column to system_chat_messages for token tracking

Revision ID: 009
Revises: 008
Create Date: 2026-05-06 00:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "system_chat_messages",
        sa.Column("usage", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("system_chat_messages", "usage")
