"""API tokens for the integration read API

Revision ID: 016
Revises: 015
Create Date: 2026-09-19 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY


revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),

        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),

        sa.Column("prefix", sa.String(32), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),

        sa.Column("scopes", ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("organization_ids", ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"),

        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_ip", sa.String(64), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), nullable=True),
    )
    op.create_index("ix_api_tokens_prefix", "api_tokens", ["prefix"])
    op.create_index("ix_api_tokens_token_hash", "api_tokens", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_api_tokens_token_hash", table_name="api_tokens")
    op.drop_index("ix_api_tokens_prefix", table_name="api_tokens")
    op.drop_table("api_tokens")
