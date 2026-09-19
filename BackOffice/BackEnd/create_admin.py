"""One-time / occasional CLI to create or reset a BackOffice admin login.
There is no self-registration flow — this is a single-operator tool.

Usage:
    python create_admin.py <username> <password>
"""

import sys

from app.core import security
from app.db.session import SessionLocal, engine
from app.models.admin_user import AdminUserDBM
from app.models.base import Base


def main() -> None:
    if len(sys.argv) != 3:
        print("Usage: python create_admin.py <username> <password>")
        sys.exit(1)

    username, password = sys.argv[1], sys.argv[2]
    if len(password) < 8:
        print("Password must be at least 8 characters.")
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(AdminUserDBM).filter(AdminUserDBM.username == username).first()
        if existing:
            existing.hashed_password = security.hash_password(password)
            existing.is_active = True
            db.commit()
            print(f"Updated password for existing admin '{username}'.")
        else:
            db.add(AdminUserDBM(username=username, hashed_password=security.hash_password(password)))
            db.commit()
            print(f"Created admin user '{username}'.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
