"""Authentication & user-account business logic."""

from __future__ import annotations

import hashlib
import logging
import math
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.constant import settings
from app.models.base import utcnow
from app.models.email_verification_token import EmailVerificationToken
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.user_setting import UserSetting
from app.schemas.auth import EmailVerificationDispatch, RegisterRequest
from app.services import security
from app.services import email_notification_service
from app.services.exceptions import AuthError, ConflictError
from app.services.metric_service import ensure_default_metrics

logger = logging.getLogger(__name__)

EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 60


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

    email_notification_service.send_notification_email(
        db,
        user,
        template_key="password_changed_alert",
        context={"changed_at": user.last_password_changed_at.isoformat()},
    )
    return user


def _hash_verification_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _build_verification_url(raw_token: str) -> str:
    base = (settings.public_frontend_base_url or "https://shadow-pa.web.app").rstrip("/")
    safe_token = quote(raw_token, safe="")
    return f"{base}/verify-email?token={safe_token}"


def _normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_email_verification_retry_after_seconds(
    db: Session,
    user: User,
    *,
    now: datetime | None = None,
) -> int:
    current_time = now or utcnow()
    latest_token = db.scalar(
        select(EmailVerificationToken)
        .where(EmailVerificationToken.user_id == user.id)
        .order_by(EmailVerificationToken.created_at.desc())
    )
    if latest_token is None:
        return 0

    next_allowed_at = _normalize_utc(latest_token.created_at) + timedelta(
        seconds=EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS
    )
    remaining_seconds = math.ceil((next_allowed_at - current_time).total_seconds())
    return max(0, remaining_seconds)


def request_email_verification(db: Session, user: User) -> EmailVerificationDispatch:
    if user.email_verified:
        return EmailVerificationDispatch(
            detail="Email is already verified.",
            email_sent=False,
            verification_url_preview=None,
            retry_after_seconds=0,
        )

    now = utcnow()
    retry_after_seconds = get_email_verification_retry_after_seconds(db, user, now=now)
    if retry_after_seconds > 0:
        return EmailVerificationDispatch(
            detail=(
                f"Please wait {retry_after_seconds} seconds before requesting "
                "another verification email."
            ),
            email_sent=False,
            verification_url_preview=None,
            retry_after_seconds=retry_after_seconds,
        )

    db.execute(
        delete(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
        )
    )

    raw_token = secrets.token_urlsafe(48)
    token_row = EmailVerificationToken(
        user_id=user.id,
        token_hash=_hash_verification_token(raw_token),
        expires_at=now + timedelta(minutes=settings.email_verification_token_ttl_minutes),
    )
    db.add(token_row)
    db.commit()

    verification_url = _build_verification_url(raw_token)
    email_sent = email_notification_service.send_notification_email(
        db,
        user,
        template_key="verification_reminders",
        force=True,
        context={
            "verification_url": verification_url,
            "expires_minutes": settings.email_verification_token_ttl_minutes,
        },
    )

    preview_url = verification_url if settings.environment.lower() != "production" else None
    if email_sent:
        detail = "Verification email sent."
    else:
        detail = "Verification link created. Configure SMTP to send emails automatically."
        logger.info("Verification email not sent because SMTP is unavailable.")

    return EmailVerificationDispatch(
        detail=detail,
        email_sent=email_sent,
        verification_url_preview=preview_url,
        retry_after_seconds=EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    )


def verify_email_by_token(db: Session, raw_token: str) -> User:
    token = (raw_token or "").strip()
    if not token:
        raise AuthError("Verification link is invalid or expired")

    now = utcnow()
    row = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == _hash_verification_token(token)
        )
    )
    if row is None or row.used_at is not None or _normalize_utc(row.expires_at) < now:
        raise AuthError("Verification link is invalid or expired")

    user = db.get(User, row.user_id)
    if user is None:
        raise AuthError("Verification link is invalid or expired")

    user.email_verified = True
    row.used_at = now
    db.execute(
        delete(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.id != row.id,
        )
    )
    db.commit()
    db.refresh(user)
    return user
