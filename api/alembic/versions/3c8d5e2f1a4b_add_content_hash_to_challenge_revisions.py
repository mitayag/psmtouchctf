"""add content_hash to challenge_revisions

Revision ID: 3c8d5e2f1a4b
Revises: 8f4a2b1c9d3e
Create Date: 2026-09-21 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c8d5e2f1a4b'
down_revision: Union[str, None] = '8f4a2b1c9d3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('challenge_revisions', sa.Column('content_hash', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('challenge_revisions', 'content_hash')
