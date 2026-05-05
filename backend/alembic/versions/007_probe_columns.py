"""Probe metadata for ssl_certificates and domains

Revision ID: 007
Revises: 006
Create Date: 2026-05-05 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ssl_certificates', sa.Column('host', sa.String(255), nullable=True))
    op.add_column('ssl_certificates', sa.Column('port', sa.Integer(), nullable=True))
    op.add_column('ssl_certificates', sa.Column('subject_cn', sa.String(255), nullable=True))
    op.add_column('ssl_certificates', sa.Column('signature_algorithm', sa.String(100), nullable=True))
    op.add_column('ssl_certificates', sa.Column('key_size', sa.Integer(), nullable=True))
    op.add_column('ssl_certificates', sa.Column('serial_number', sa.String(255), nullable=True))
    op.add_column('ssl_certificates', sa.Column('last_probed_at', sa.DateTime(timezone=True), nullable=True))

    op.add_column('domains', sa.Column('last_probed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('domains', sa.Column('whois_data', JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('domains', 'whois_data')
    op.drop_column('domains', 'last_probed_at')

    op.drop_column('ssl_certificates', 'last_probed_at')
    op.drop_column('ssl_certificates', 'serial_number')
    op.drop_column('ssl_certificates', 'key_size')
    op.drop_column('ssl_certificates', 'signature_algorithm')
    op.drop_column('ssl_certificates', 'subject_cn')
    op.drop_column('ssl_certificates', 'port')
    op.drop_column('ssl_certificates', 'host')
