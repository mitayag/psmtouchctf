"""add extended_duration_seconds to rulesets

Revision ID: 8f4a2b1c9d3e
Revises: 2a92775f145c
Create Date: 2026-09-21 05:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f4a2b1c9d3e'
down_revision: Union[str, None] = '2a92775f145c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('rulesets', sa.Column('extended_duration_seconds', sa.Integer(), nullable=False, server_default='300'))


def downgrade() -> None:
    op.drop_column('rulesets', 'extended_duration_seconds')
