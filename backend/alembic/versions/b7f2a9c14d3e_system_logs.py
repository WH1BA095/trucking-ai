"""system_logs

Revision ID: b7f2a9c14d3e
Revises: 380956fe9a9a
Create Date: 2026-07-11 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7f2a9c14d3e'
down_revision: Union[str, None] = '380956fe9a9a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('system_logs',
    sa.Column('id', sa.UUID(as_uuid=False), nullable=False),
    sa.Column('kind', sa.String(), nullable=False),
    sa.Column('level', sa.String(), nullable=False),
    sa.Column('component', sa.String(), nullable=True),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('details', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_system_logs_kind'), 'system_logs', ['kind'], unique=False)
    op.create_index(op.f('ix_system_logs_created_at'), 'system_logs', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_system_logs_created_at'), table_name='system_logs')
    op.drop_index(op.f('ix_system_logs_kind'), table_name='system_logs')
    op.drop_table('system_logs')
