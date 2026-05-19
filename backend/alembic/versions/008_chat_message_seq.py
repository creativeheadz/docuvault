"""Add monotonic seq column to system_chat_messages

All rows from a single chat turn share an identical created_at because
server_default=now() returns the transaction-start time, and uuid4 ids
make tie-breaking non-deterministic. That shuffles the message order
returned to Anthropic and produces 400 errors when tool_result blocks
land before their tool_use parents. Switch ordering to a strict
monotonic sequence.

Revision ID: 008
Revises: 007
Create Date: 2026-05-06 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '008'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "system_chat_messages",
        sa.Column("seq", sa.BigInteger(), nullable=True),
    )
    # Backfill existing rows using physical insert order (ctid) within each
    # (system_id, created_at) bucket. ctid reflects heap insertion order,
    # which matches the order rows were appended in run_chat_turn.
    op.execute("""
        WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, ctid) AS rn
            FROM system_chat_messages
        )
        UPDATE system_chat_messages m
        SET seq = ordered.rn
        FROM ordered
        WHERE m.id = ordered.id
    """)
    op.alter_column("system_chat_messages", "seq", nullable=False)

    op.execute("CREATE SEQUENCE system_chat_messages_seq_seq OWNED BY system_chat_messages.seq")
    op.execute(
        "SELECT setval('system_chat_messages_seq_seq', "
        "COALESCE((SELECT MAX(seq) FROM system_chat_messages), 0) + 1, false)"
    )
    op.execute(
        "ALTER TABLE system_chat_messages "
        "ALTER COLUMN seq SET DEFAULT nextval('system_chat_messages_seq_seq')"
    )
    op.create_index(
        "ix_system_chat_messages_system_seq",
        "system_chat_messages",
        ["system_id", "seq"],
    )


def downgrade() -> None:
    op.drop_index("ix_system_chat_messages_system_seq", table_name="system_chat_messages")
    op.execute("ALTER TABLE system_chat_messages ALTER COLUMN seq DROP DEFAULT")
    op.drop_column("system_chat_messages", "seq")
    op.execute("DROP SEQUENCE IF EXISTS system_chat_messages_seq_seq")
