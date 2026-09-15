"""
Authentication service.

Account lockout design
──────────────────────
Failed logins increment `login_attempts` (atomic SQL UPDATE) and set
`lockout_until` at the threshold.  Locked accounts raise AuthError (401) — the
same response as a wrong password or unknown email — so an attacker cannot
distinguish "account exists and is locked" from "wrong credentials".  The IP-
based rate limiter still provides the 429 feedback path when the same IP hits
the threshold repeatedly.

Locked accounts therefore have two layers of protection:
  • DB-persisted per-account lockout (survives IP rotation and server restart)
  • In-memory per-IP lockout (separate, gives the 429 / Retry-After response)

A single atomic UPDATE (increment + CASE for lockout) removes the
read-modify-write race that was present when two concurrent workers could both
read lockout_until=None before either committed.
"""

import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, AuthError
from app.core import security
from app.models.user import UserDBM
from app.schemas.auth import RegisterRequest
from app.services import notifications_service

_LOCKOUT_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15


def _now_utc() -> datetime:
    """Current UTC time as a naive datetime (matches SQLite storage)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalise_email(email: str) -> str:
    return email.strip().lower()


def _get_user_by_email(db: Session, email: str) -> UserDBM | None:
    """Look up a user by already-normalised email."""
    return db.scalar(
        select(UserDBM).where(UserDBM.email == email)
    )


def get_user_by_id(db: Session, user_id: int) -> UserDBM | None:
    return db.get(UserDBM, user_id)


def login_user(db: Session, email: str, password: str) -> UserDBM:
    # Normalise at the entry boundary so every downstream path sees the same value.
    email = _normalise_email(email)
    user = _get_user_by_email(db, email)
    if user is None:
        raise AuthError()

    now = _now_utc()

    # ── Account lockout check ────────────────────────────────────────────────
    # Raise AuthError (not TooManyRequestsError) so the external response is
    # identical to "wrong password / unknown email" and cannot be used for
    # account enumeration.  The IP rate limiter handles the 429 / Retry-After path.
    if user.lockout_until is not None:
        if now < user.lockout_until:
            raise AuthError()
        # Lockout has expired: reset counter before this attempt is counted.
        # flush() writes the reset to the DB so the SQL increment below sees 0.
        db.execute(
            update(UserDBM)
            .where(UserDBM.id == user.id)
            .values(login_attempts=0, lockout_until=None)
        )
        db.flush()

    # ── Password check ───────────────────────────────────────────────────────
    if not security.verify_password(password, user.hashed_password):
        # Check before the UPDATE whether this attempt crosses the lockout threshold.
        will_lock = user.login_attempts == _LOCKOUT_ATTEMPTS - 1 and user.lockout_until is None

        # Single atomic UPDATE: increment counter and conditionally set lockout_until.
        lockout_time = _now_utc() + timedelta(minutes=_LOCKOUT_MINUTES)
        db.execute(
            update(UserDBM)
            .where(UserDBM.id == user.id)
            .values(
                login_attempts=UserDBM.login_attempts + 1,
                lockout_until=case(
                    (
                        (UserDBM.login_attempts + 1 >= _LOCKOUT_ATTEMPTS)
                        & UserDBM.lockout_until.is_(None),
                        lockout_time,
                    ),
                    else_=UserDBM.lockout_until,
                ),
            )
        )

        if will_lock:
            from app.services import session_service
            if session_service.get_session_count(db, user.id) > 0:
                notifications_service.create_notification(
                    db, user,
                    title="Account temporarily locked",
                    body=(
                        f"Your account was locked after {_LOCKOUT_ATTEMPTS} consecutive "
                        "failed login attempts. If this wasn't you, consider changing your password."
                    ),
                    type="security",
                    level=notifications_service.LEVEL_CRITICAL,
                    url="/settings",
                )

        db.commit()  # persist failure — caller raises and session won't commit otherwise
        raise AuthError()

    # ── Success — clear lockout state ────────────────────────────────────────
    if user.login_attempts or user.lockout_until is not None:
        db.execute(
            update(UserDBM)
            .where(UserDBM.id == user.id)
            .values(login_attempts=0, lockout_until=None)
        )
        # Not committed here; _build_token_response commits the full session.

    return user


def register_user(db: Session, data: RegisterRequest) -> UserDBM:
    email = _normalise_email(str(data.email))
    if _get_user_by_email(db, email) is not None:
        raise ConflictError("An account with this email already exists.")

    user = UserDBM(
        name=data.name.strip(),
        email=email,
        hashed_password=security.hash_password(data.password),
    )

    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("An account with this email already exists.")
    db.refresh(user)
    notifications_service.create_notification(
        db, user,
        title=f"Welcome to Shadow, {user.name.split()[0]}!",
        body="Your intelligent productivity assistant is ready. Start by setting a goal.",
        type="system",
        level=notifications_service.LEVEL_CRITICAL,
        url="/goals",
        event_key=f"welcome:{user.id}",
    )

    return user
