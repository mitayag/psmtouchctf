"""Add prize, inventory, award, staff_user, and audit_log tables

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    award_state_enum = sa.Enum("awarded", "redeemed", "expired", "voided", name="awardstate")
    staff_role_enum = sa.Enum("staff", "admin", name="staffrole")
    award_state_enum.create(op.get_bind(), checkfirst=True)
    staff_role_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "prizes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_id", sa.String(36), sa.ForeignKey("events.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_label", sa.String(50), nullable=False),
        sa.Column("icon", sa.String(10), nullable=False, server_default="🎁"),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("weight", sa.Integer, nullable=False, server_default="1"),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "prize_inventory",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("prize_id", sa.String(36), sa.ForeignKey("prizes.id"), nullable=False, unique=True),
        sa.Column("stock_received", sa.Integer, nullable=False, server_default="0"),
        sa.Column("stock_reserved", sa.Integer, nullable=False, server_default="0"),
        sa.Column("stock_redeemed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "staff_users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(100), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", staff_role_enum, nullable=False, server_default="staff"),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime(timezone=False), nullable=True),
    )

    op.create_table(
        "awards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("event_id", sa.String(36), sa.ForeignKey("events.id"), nullable=False),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("game_sessions.id"), nullable=False),
        sa.Column("entitlement_id", sa.String(36), sa.ForeignKey("entitlements.id"), nullable=False),
        sa.Column("prize_id", sa.String(36), sa.ForeignKey("prizes.id"), nullable=False),
        sa.Column("claim_code", sa.String(50), nullable=False),
        sa.Column("claim_code_hash", sa.String(64), nullable=False),
        sa.Column("segment_index", sa.Integer, nullable=False),
        sa.Column("status", award_state_enum, nullable=False, server_default="awarded"),
        sa.Column("draw_snapshot", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
        sa.Column("redeemed_at", sa.DateTime(timezone=False), nullable=True),
        sa.Column("redeemed_by", sa.String(36), sa.ForeignKey("staff_users.id"), nullable=True),
    )
    op.create_unique_constraint("uq_award_session", "awards", ["session_id"])
    op.create_unique_constraint("uq_award_claim_code", "awards", ["claim_code"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("actor_type", sa.String(50), nullable=False, server_default="system"),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=False), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("awards")
    op.drop_table("staff_users")
    op.drop_table("prize_inventory")
    op.drop_table("prizes")
    sa.Enum(name="awardstate").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="staffrole").drop(op.get_bind(), checkfirst=True)
