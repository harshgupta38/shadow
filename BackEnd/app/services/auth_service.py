"""Authentication & user-account business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.user_setting import UserSetting
from app.schemas.auth import RegisterRequest
from app.services import security
from app.services.exceptions import AuthError, ConflictError
from app.services.metric_service import ensure_default_metrics


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.strip().lower()))


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def register_user(db: Session, data: RegisterRequest) -> User:
    email = str(data.email).strip().lower()
    if get_user_by_email(db, email) is not None:
        raise ConflictError("An account with this email already exists")

    user = User(
        email=email,
        hashed_password=security.hash_password(data.password),
        name=data.name.strip(),
        timezone="Asia/Kolkata",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create a default identity profile + behavior settings record so
    # Profile/Settings pages can update independently from day one.
    db.add(
        UserProfile(
            user_id=user.id,
            display_name=user.name,
            current_goal="Stay consistent with my goals",
        )
    )
    db.add(UserSetting(user_id=user.id, theme_preference=user.theme_preference))
    db.commit()

    # Seed sensible default metrics so the dashboard is useful immediately.
    ensure_default_metrics(db, user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if user is None or not security.verify_password(password, user.hashed_password):
        raise AuthError("Incorrect email or password")
    return user


def change_password(db: Session, user: User, *, current_password: str, new_password: str) -> User:
    if not security.verify_password(current_password, user.hashed_password):
        raise AuthError("Current password is incorrect")
    if security.verify_password(new_password, user.hashed_password):
        raise ConflictError("New password must be different from the current password")

    user.hashed_password = security.hash_password(new_password)
    user.last_password_changed_at = utcnow()
    db.commit()
    db.refresh(user)
    return user
