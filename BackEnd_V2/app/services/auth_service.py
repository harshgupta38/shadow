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

import logging
import math
import threading
from datetime import datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, AuthError, ValidationError
from app.core import security
from app.models.user import UserDBM
from app.schemas.auth import RegisterRequest
from app.services import notifications_service

logger = logging.getLogger(__name__)

_LOCKOUT_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15

# Server-side floor on /auth/resend-verification, independent of whatever
# cooldown the frontend button enforces on its own — matches the frontend's
# own 30s cooldown (AccountSecurityPanel.tsx) so a repeat call inside the
# window is a silent no-op rather than a confusing "failed to send" error.
_VERIFICATION_RESEND_COOLDOWN_SECONDS = 30


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


def _notify_failed_login(user_id: int, ip_address: str | None, user_agent: str) -> None:
    """Security alert for a wrong-password attempt: a short in-app/push
    notification, plus a structured email (labeled device/location/IP/time,
    with a map when we have coordinates) sent directly — always-on regardless
    of the user's general email preference, see send_notification_email's
    notif_type == "security" bypass.

    Fully sync — safe to call from a daemon thread. Opens its own DB session.
    The IP geolocation lookup is a real network call, which is exactly why this
    runs off the request path instead of inline in login_user().
    """
    from app.common import now_ist
    from app.db.session import SessionLocal
    from app.services import email_notification_service, ip_geolocation_service, session_service

    try:
        with SessionLocal() as db:
            user = db.get(UserDBM, user_id)
            if not user:
                return

            device_name, browser, os_name = session_service.parse_user_agent(user_agent)
            device = f"{device_name} ({browser} on {os_name})"
            ip_display = ip_address or "Unknown"
            when = now_ist().strftime("%d %b %Y, %I:%M %p IST")

            geo = ip_geolocation_service.lookup_geo(ip_address)
            location = geo.get("label") if geo else None
            map_url = None
            if geo and geo.get("latitude") is not None and geo.get("longitude") is not None:
                map_url = ip_geolocation_service.static_map_url(geo["latitude"], geo["longitude"])

            in_app_body = f"From {device}" + (f" near {location}" if location else "") + f" — {when}."

            notif = notifications_service.create_notification(
                db, user,
                title="Failed sign-in attempt",
                body=in_app_body,
                type="security",
                level=notifications_service.LEVEL_CRITICAL,
                url="/settings",
                send_email=False,
            )
            if notif is not None:
                try:
                    email_notification_service.send_failed_login_alert(
                        db, user,
                        device=device,
                        ip_address=ip_display,
                        location=location,
                        map_url=map_url,
                        when=when,
                        notification_id=notif.id,
                    )
                except Exception:
                    logger.warning("Failed-login email failed for user %d", user_id, exc_info=True)
    except Exception:
        logger.exception("Failed-login alert failed for user %d", user_id)


def get_user_by_id(db: Session, user_id: int) -> UserDBM | None:
    return db.get(UserDBM, user_id)


def login_user(db: Session, email: str, password: str, request: Request | None = None) -> UserDBM:
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

        # Every wrong-password attempt gets its own alert (in-app + email), not
        # just the eventual lockout — IP geolocation makes this slow, so it runs
        # off the request path in a background thread.
        ip_address = request.client.host if request and request.client else None
        user_agent = request.headers.get("user-agent", "") if request else ""
        threading.Thread(
            target=_notify_failed_login,
            args=(user.id, ip_address, user_agent),
            daemon=True,
        ).start()

        raise AuthError()

    # ── Success — clear lockout state ────────────────────────────────────────
    if user.login_attempts or user.lockout_until is not None:
        db.execute(
            update(UserDBM)
            .where(UserDBM.id == user.id)
            .values(login_attempts=0, lockout_until=None)
        )
        # Not committed here; _build_token_response commits the full session.

    # A deactivated account (Profile page "Danger Zone") reactivates the
    # moment its owner signs back in — deactivation is a pause, not a ban.
    if not user.is_active:
        db.execute(update(UserDBM).where(UserDBM.id == user.id).values(is_active=True))
        user.is_active = True

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

    try:
        from app.services import email_notification_service
        email_notification_service.send_welcome_email(user)
        if email_notification_service.send_verification_email(user):
            user.verification_email_sent_at = _now_utc()
            db.commit()
    except Exception:
        pass

    return user


# ─── Profile page account actions ──────────────────────────────────────────────

def _require_current_password(user: UserDBM, current_password: str) -> None:
    if not security.verify_password(current_password, user.hashed_password):
        raise ValidationError(
            "Current password is incorrect.",
            errors={"current_password": "Current password is incorrect."},
        )


def _notify_password_changed(db: Session, user: UserDBM) -> None:
    notifications_service.create_notification(
        db, user,
        title="Password changed",
        body="Your account password was just changed. If this wasn't you, contact support immediately.",
        type="security",
        level=notifications_service.LEVEL_CRITICAL,
        url="/profile",
    )


def update_name(db: Session, user: UserDBM, name: str) -> UserDBM:
    user.name = name.strip()
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: UserDBM, current_password: str, new_password: str) -> None:
    _require_current_password(user, current_password)

    user.hashed_password = security.hash_password(new_password)
    db.commit()

    _notify_password_changed(db, user)


def resend_verification_email(db: Session, user: UserDBM) -> None:
    if user.email_verified:
        return

    now = _now_utc()
    if user.verification_email_sent_at is not None:
        elapsed = (now - user.verification_email_sent_at).total_seconds()
        if elapsed < _VERIFICATION_RESEND_COOLDOWN_SECONDS:
            return  # sent moments ago — silent no-op, not a failure

    from app.services import email_notification_service
    try:
        sent = email_notification_service.send_verification_email(user)
    except Exception:
        logger.warning("Failed to send verification email to user %d", user.id, exc_info=True)
        sent = False

    if sent:
        user.verification_email_sent_at = now
        db.commit()


def deactivate_account(db: Session, user: UserDBM, current_password: str) -> None:
    """Pauses the account — see login_user for the matching reactivation.
    Re-verifies the password so a hijacked session can't pause/hide the
    account without knowing the credential."""
    _require_current_password(user, current_password)
    user.is_active = False
    db.commit()


def delete_account(db: Session, user: UserDBM, current_password: str) -> None:
    """Hard-deletes the user row. Every owned table (goals, habits, tasks,
    sessions, settings, ...) cascades via its FK's ondelete="CASCADE",
    enforced by SQLite's PRAGMA foreign_keys=ON (see db/session.py).
    Re-verifies the password — this is irreversible, a session cookie alone
    isn't enough authority to destroy the account."""
    _require_current_password(user, current_password)
    db.delete(user)
    db.commit()


# ─── Forgot / reset password ────────────────────────────────────────────────────

def request_password_reset(db: Session, email: str) -> None:
    """Sends a reset link if an account with this email exists. Always
    "succeeds" from the caller's point of view either way — never reveals
    whether the address is registered (same account-enumeration reasoning as
    login's generic AuthError)."""
    email = _normalise_email(email)
    user = _get_user_by_email(db, email)
    if user is None:
        return

    from app.services import email_notification_service
    token = email_notification_service.issue_reset_password_token(user)
    try:
        email_notification_service.send_reset_password_email(user, token)
    except Exception:
        logger.warning("Failed to send reset-password email to user %d", user.id, exc_info=True)


def reset_password(db: Session, uid: int, token: str, new_password: str) -> UserDBM:
    """Completes a /auth/forgot-password reset. No session/cookie is involved
    on this path (the link may be opened on a device that was never signed
    in), so identity is proven entirely by the token."""
    from app.services import email_notification_service, session_service

    user = db.get(UserDBM, uid)
    if user is None or not email_notification_service.verify_reset_password_token(user, token):
        raise ValidationError("This reset link is invalid or has expired. Please request a new one.")

    user.hashed_password = security.hash_password(new_password)
    # Clicking a link delivered to the inbox is itself proof the user controls
    # that address — same trust level as the dedicated verify-email flow.
    if not user.email_verified:
        user.email_verified = True
    db.commit()

    # Unlike change_password (which preserves the session making the request),
    # there is no session to preserve here — the user must sign back in
    # everywhere, matching the product spec for this flow.
    session_service.revoke_all_sessions(db, user.id)
    _notify_password_changed(db, user)
    return user
