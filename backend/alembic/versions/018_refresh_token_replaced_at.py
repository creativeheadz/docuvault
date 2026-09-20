"""When a refresh token was rotated, so a race is not read as theft

Revision ID: 018
Revises: 017
Create Date: 2026-09-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("replaced_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Rows rotated before this column existed have no timestamp, and
    # `rotate` treats a missing one as "too old to be a race" - which is the
    # safe direction: worst case somebody signs in again.


def downgrade() -> None:
    op.drop_column("refresh_tokens", "replaced_at")
