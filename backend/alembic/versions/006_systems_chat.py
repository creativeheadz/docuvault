"""Systems and chat-driven authoring

Revision ID: 006
Revises: 005
Create Date: 2026-05-05 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'systems',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(255), nullable=False, unique=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('short_description', sa.String(500), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('tags', ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('snippets', JSONB(), nullable=False, server_default='{}'),
        sa.Column('palace_drawer_ids', ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('color', sa.String(20), nullable=True),
        sa.Column('icon', sa.String(50), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_systems_name', 'systems', ['name'])
    op.create_index('ix_systems_slug', 'systems', ['slug'])
    op.create_index('ix_systems_category', 'systems', ['category'])
    op.create_index('ix_systems_status', 'systems', ['status'])

    op.create_table(
        'system_chat_messages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('system_id', UUID(as_uuid=True), sa.ForeignKey('systems.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', JSONB(), nullable=False, server_default='[]'),
    )
    op.create_index('ix_system_chat_messages_system_id', 'system_chat_messages', ['system_id'])


def downgrade() -> None:
    op.drop_index('ix_system_chat_messages_system_id', table_name='system_chat_messages')
    op.drop_table('system_chat_messages')
    op.drop_index('ix_systems_status', table_name='systems')
    op.drop_index('ix_systems_category', table_name='systems')
    op.drop_index('ix_systems_slug', table_name='systems')
    op.drop_index('ix_systems_name', table_name='systems')
    op.drop_table('systems')
