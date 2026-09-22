#!/usr/bin/env python3
"""Bootstrap a staff user for PSM TouchCTF.

Usage:
    python scripts/create_staff.py <username> <password> [role]

Role defaults to 'staff'. Use 'admin' for administrator access.

Examples:
    python scripts/create_staff.py operator Operator123!
    python scripts/create_staff.py admin AdminPass123! admin
"""
import os
import sys

# Add api directory to path
api_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'api'))
sys.path.insert(0, api_dir)

# Ensure DATABASE_URL is set for standalone usage
if not os.environ.get("DATABASE_URL") and not os.environ.get("db_password"):
    db_path = os.path.normpath(os.path.join(api_dir, "touchctf_dev.db"))
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

from app.database import Base, SessionLocal, engine
from app.engine import create_staff_user


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    role = sys.argv[3] if len(sys.argv) > 3 else "staff"

    if role not in ("staff", "admin"):
        print(f"Invalid role: {role}. Must be 'staff' or 'admin'.")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        user = create_staff_user(db, username, password, role)
        print(f"Staff user created:")
        print(f"  Username: {user.username}")
        print(f"  Role:     {user.role.value}")
        print(f"  ID:       {user.id}")
        print()
        print(f"Use this ID as the Bearer token for staff API calls.")
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
