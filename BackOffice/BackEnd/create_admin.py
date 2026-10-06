"""One-time / occasional CLI to create or reset a BackOffice admin login.
There is no self-registration flow — this is a single-operator tool.

Usage:
    python create_admin.py
    (prompts interactively for name, email, and password)
"""

import getpass

from app.core import security
from app.db.session import SessionLocal, engine
from app.models.admin_user import AdminUserDBM
from app.models.base import Base
from app.validators.email import validate_email_address
from app.validators.password import validate_password


def main() -> None:
    name = input("Name: ").strip()
    if not name:
        print("Name is required.")
        return

    try:
        # Lower-cased so this CLI can never create/update the same admin
        # under two different casings of the same address — the API's
        # auth_service/users_service normalise the same way at every
        # lookup and write.
        email = validate_email_address(input("Email: ")).lower()
    except ValueError as exc:
        print(str(exc))
        return

    password = getpass.getpass("Password: ")
    try:
        validate_password(password)
    except ValueError as exc:
        print(str(exc))
        return

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(AdminUserDBM).filter(AdminUserDBM.email == email).first()
        if existing:
            existing.name = name
            existing.hashed_password = security.hash_password(password)
            existing.is_active = True
            db.commit()
            print(f"Updated admin '{email}'.")
        else:
            db.add(AdminUserDBM(name=name, email=email, hashed_password=security.hash_password(password)))
            db.commit()
            print(f"Created admin user '{email}'.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
