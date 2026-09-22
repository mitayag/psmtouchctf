"""Add prepared state and prepared_at to game_sessions

Revision ID: d4e5f6a7b8c9
Revises: 3c8d5e2f1a4b
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "3c8d5e2f1a4b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add the 'prepared_at' column to game_sessions
    with op.batch_alter_table("game_sessions") as batch_op:
        batch_op.add_column(
            sa.Column("prepared_at", sa.DateTime(timezone=False), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("game_sessions") as batch_op:
        batch_op.drop_column("prepared_at")
