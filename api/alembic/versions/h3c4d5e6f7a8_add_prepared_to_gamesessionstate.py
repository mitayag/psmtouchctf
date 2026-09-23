"""Add missing 'prepared' value to gamesessionstate enum

Revision ID: h3c4d5e6f7a8
Revises: g2b3c4d5e6f7
Create Date: 2026-09-23
"""
from alembic import op
import sqlalchemy as sa

revision = "h3c4d5e6f7a8"
down_revision = "g2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "sqlite":
        # 2a92775f145c created gamesessionstate without 'prepared'; d4e5f6a7b8c9
        # added the column but never the enum value, so any query binding
        # state='prepared' failed with InvalidTextRepresentation (HTTP 500).
        op.execute(
            sa.text("ALTER TYPE gamesessionstate ADD VALUE IF NOT EXISTS 'prepared'")
        )


def downgrade() -> None:
    # PostgreSQL cannot remove values from an existing enum type; additive only.
    pass
