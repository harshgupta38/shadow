"""Authentication & user-account business logic."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    ActivityLog,
    ChatMessage,
    ChatSession,
    Goal,
    JournalEntry,
    MemoryEntry,
    Milestone,
    Notification,
    PlannedTask,
    Report,
    TrackedMetric,
)
from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.services import security
from app.services.exceptions import AppError, AuthError, ConflictError
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
        timezone=data.timezone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Seed sensible default metrics so the dashboard is useful immediately.
    ensure_default_metrics(db, user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if user is None or not security.verify_password(password, user.hashed_password):
        raise AuthError("Incorrect email or password")
    return user


def change_password(
    db: Session, user: User, current_password: str, new_password: str
) -> None:
    """Update the user's password after verifying the current one."""
    if not security.verify_password(current_password, user.hashed_password):
        raise AppError("Current password is incorrect")
    user.hashed_password = security.hash_password(new_password)
    db.commit()


def delete_account(db: Session, user: User, password: str) -> None:
    """Permanently delete the user and all of their data.

    Child rows are removed explicitly in foreign-key dependency order so the
    operation is portable across databases (SQLite in tests, Postgres in prod)
    regardless of whether FK cascades are enforced by the engine.
    """
    if not security.verify_password(password, user.hashed_password):
        raise AppError("Password is incorrect")

    user_id = user.id
    goal_ids = select(Goal.id).where(Goal.user_id == user_id).scalar_subquery()
    session_ids = (
        select(ChatSession.id).where(ChatSession.user_id == user_id).scalar_subquery()
    )

    # Nested children first (rows that reference goals / chat sessions).
    db.execute(delete(Milestone).where(Milestone.goal_id.in_(goal_ids)))
    db.execute(delete(ChatMessage).where(ChatMessage.session_id.in_(session_ids)))

    # Rows that reference the user directly (activity logs before metrics).
    db.execute(delete(ActivityLog).where(ActivityLog.user_id == user_id))
    db.execute(delete(Report).where(Report.user_id == user_id))
    db.execute(delete(PlannedTask).where(PlannedTask.user_id == user_id))
    db.execute(delete(Notification).where(Notification.user_id == user_id))
    db.execute(delete(JournalEntry).where(JournalEntry.user_id == user_id))
    db.execute(delete(MemoryEntry).where(MemoryEntry.user_id == user_id))
    db.execute(delete(TrackedMetric).where(TrackedMetric.user_id == user_id))
    db.execute(delete(ChatSession).where(ChatSession.user_id == user_id))
    db.execute(delete(Goal).where(Goal.user_id == user_id))
    db.execute(delete(User).where(User.id == user_id))
    db.commit()
