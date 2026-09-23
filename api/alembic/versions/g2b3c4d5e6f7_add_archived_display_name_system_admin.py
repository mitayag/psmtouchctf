"""Add archived column to prizes, display_name to staff_users, system_admin role

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-09-22
"""
from alembic import op
import sqlalchemy as sa

revision = "g2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("prizes") as batch_op:
        batch_op.add_column(sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.text("false")))

    with op.batch_alter_table("staff_users") as batch_op:
        batch_op.add_column(sa.Column("display_name", sa.String(200), nullable=True))

    if op.get_bind().dialect.name != "sqlite":
        # staffrole already exists from revision f1a2b3c4d5e6 with (staff, admin);
        # create(checkfirst=True) would skip it and system_admin would never be added.
        staff_role_enum = sa.Enum("staff", "admin", "system_admin", name="staffrole")
        staff_role_enum.create(op.get_bind(), checkfirst=True)
        op.execute(sa.text("ALTER TYPE staffrole ADD VALUE IF NOT EXISTS 'system_admin'"))


def downgrade() -> None:
    with op.batch_alter_table("staff_users") as batch_op:
        batch_op.drop_column("display_name")

    with op.batch_alter_table("prizes") as batch_op:
        batch_op.drop_column("archived")

    if op.get_bind().dialect.name != "sqlite":
        sa.Enum(name="staffrole").drop(op.get_bind(), checkfirst=True)
