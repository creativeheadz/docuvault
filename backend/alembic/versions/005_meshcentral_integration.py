"""MeshCentral integration columns

Revision ID: 005
Revises: 004
Create Date: 2024-01-05 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Organization: mesh_id
    op.add_column('organizations', sa.Column('mesh_id', sa.String(255), nullable=True))
    op.create_unique_constraint('uq_organizations_mesh_id', 'organizations', ['mesh_id'])
    op.create_index('ix_organizations_mesh_id', 'organizations', ['mesh_id'])

    # Configuration: mesh columns
    op.add_column('configurations', sa.Column('mesh_node_id', sa.String(255), nullable=True))
    op.add_column('configurations', sa.Column('mesh_agent_connected', sa.Boolean(), nullable=True))
    op.add_column('configurations', sa.Column('mesh_last_sync_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('configurations', sa.Column('mesh_extra', JSONB(), nullable=True))
    op.create_unique_constraint('uq_configurations_mesh_node_id', 'configurations', ['mesh_node_id'])
    op.create_index('ix_configurations_mesh_node_id', 'configurations', ['mesh_node_id'])


def downgrade() -> None:
    op.drop_index('ix_configurations_mesh_node_id', table_name='configurations')
    op.drop_constraint('uq_configurations_mesh_node_id', 'configurations', type_='unique')
    op.drop_column('configurations', 'mesh_extra')
    op.drop_column('configurations', 'mesh_last_sync_at')
    op.drop_column('configurations', 'mesh_agent_connected')
    op.drop_column('configurations', 'mesh_node_id')

    op.drop_index('ix_organizations_mesh_id', table_name='organizations')
    op.drop_constraint('uq_organizations_mesh_id', 'organizations', type_='unique')
    op.drop_column('organizations', 'mesh_id')
