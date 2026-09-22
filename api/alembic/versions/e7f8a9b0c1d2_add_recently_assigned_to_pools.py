"""Add recently_assigned to ChallengePool for anti-repeat tracking."""

from alembic import op
import sqlalchemy as sa

revision = "e7f8a9b0c1d2"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "challenge_pools",
        sa.Column("recently_assigned", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("challenge_pools", "recently_assigned")
