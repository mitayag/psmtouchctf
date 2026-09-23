#!/usr/bin/env python3
"""Report how many active system administrators exist.

Prints a single integer on stdout. Used by install.sh to decide whether
an administrator already exists on a reinstallation.
"""
import sys

from sqlalchemy import func

from app.database import SessionLocal
from app.models import StaffRole, StaffUser


def main() -> int:
    db = SessionLocal()
    try:
        count = (
            db.query(func.count(StaffUser.id))
            .filter(
                StaffUser.role == StaffRole.system_admin,
                StaffUser.active == True,  # noqa: E712
            )
            .scalar()
            or 0
        )
    finally:
        db.close()
    print(count)
    return 0


if __name__ == "__main__":
    sys.exit(main())
