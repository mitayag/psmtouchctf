#!/usr/bin/env python3
"""Create a staff user without exposing credentials.

Usage:
    printf '%s\\0%s' "$username" "$password" | python3 -m app.create_staff [role]

The role is taken from argv (it is not a secret); the username and
password are read from stdin as two NUL-separated fields so they never
appear in process arguments, environment variables, or interpolated
Python source.

The database schema must already exist (created by the ``migrate``
service via ``alembic upgrade head``); this module never calls
``Base.metadata.create_all``.
"""
import sys

from app.database import SessionLocal
from app.engine import create_staff_user

ALLOWED_ROLES = ("staff", "admin", "system_admin")


def read_credentials() -> tuple[str, str]:
    raw = sys.stdin.buffer.read()
    parts = raw.split(b"\x00", 1)
    if len(parts) != 2:
        raise ValueError("expected NUL-separated username and password on stdin")
    username = parts[0].decode("utf-8").strip()
    password = parts[1].decode("utf-8")
    if not username:
        raise ValueError("username is required")
    if not password:
        raise ValueError("password is required")
    return username, password


def main() -> int:
    role = sys.argv[1] if len(sys.argv) > 1 else "staff"
    if role not in ALLOWED_ROLES:
        print(f"ERROR:invalid role '{role}' (allowed: {', '.join(ALLOWED_ROLES)})")
        return 1
    try:
        username, password = read_credentials()
        db = SessionLocal()
        try:
            user = create_staff_user(db, username, password, role)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001 — report any failure to the caller
        print(f"ERROR:{exc}")
        return 1
    print(f"OK:{user.username}:{user.role.value}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
