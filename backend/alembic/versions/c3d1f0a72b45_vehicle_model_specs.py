"""vehicle_model_specs

Revision ID: c3d1f0a72b45
Revises: b7f2a9c14d3e
Create Date: 2026-07-12 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d1f0a72b45'
down_revision: Union[str, None] = 'b7f2a9c14d3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('vehicle_model_specs',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('make', sa.String(), nullable=True),
    sa.Column('model', sa.String(), nullable=True),
    sa.Column('tank_gallons', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('vehicle_model_specs')
