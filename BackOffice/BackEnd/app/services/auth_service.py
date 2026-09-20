from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core import security
from app.core.exceptions import AuthError
from app.models.admin_user import AdminUserDBM


def _normalise_email(email: str) -> str:
    return email.strip().lower()


def get_admin_by_email(db: Session, email: str) -> AdminUserDBM | None:
    return db.query(AdminUserDBM).filter(AdminUserDBM.email == _normalise_email(email)).first()


def get_admin_by_id(db: Session, admin_id: int) -> AdminUserDBM | None:
    return db.get(AdminUserDBM, admin_id)


def authenticate(db: Session, email: str, password: str) -> AdminUserDBM:
    admin = get_admin_by_email(db, email)
    if admin is None or not admin.is_active or not security.verify_password(password, admin.hashed_password):
        raise AuthError("Invalid email or password.")

    admin.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(admin)
    return admin
