"""
DB-backed rate limiter for auth endpoints.

State is stored in the ip_rate_limits table so all Uvicorn workers share the
same counters — the deployment runs with --workers 4 so an in-memory dict would
only enforce the limit per-worker (~5×workers effective attempts).

Two limiters:
  • login    — 5 consecutive failures from the same IP → 15-min lockout
  • register — 5 successful sign-ups from the same IP per 60-minute window

Account lockout (per-user) lives in auth_service on the users table.
"""

import math
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.ip_rate_limit import IpRateLimitDBM

_LOGIN_KIND = "login"
_REGISTER_KIND = "register"
_FORGOT_PW_KIND = "forgot_pw"

_MAX_ATTEMPTS = 5
_LOCKOUT_MINUTES = 15

_REG_MAX_PER_WINDOW = 5
_REG_WINDOW_MINUTES = 60

_FORGOT_PW_MAX_PER_WINDOW = 5
_FORGOT_PW_WINDOW_MINUTES = 60


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_or_create(db: Session, ip: str, kind: str) -> IpRateLimitDBM:
    row = db.get(IpRateLimitDBM, (ip, kind))
    if row is None:
        row = IpRateLimitDBM(ip=ip, kind=kind)
        db.add(row)
        db.flush()
    return row


# ─── Login rate limiting ──────────────────────────────────────────────────────

def check_login_allowed(db: Session, ip: str) -> None:
    """Raise TooManyRequestsError if this IP is locked out from logging in."""
    from app.core.exceptions import TooManyRequestsError
    row = db.get(IpRateLimitDBM, (ip, _LOGIN_KIND))
    if row is None:
        return
    now = _now_utc()
    if row.lockout_until and now < row.lockout_until:
        secs = math.ceil((row.lockout_until - now).total_seconds())
        mins = math.ceil(secs / 60)
        raise TooManyRequestsError(
            f"Too many failed login attempts. Try again in {mins} minute(s).",
            retry_after=secs,
        )
    if row.lockout_until and now >= row.lockout_until:
        db.delete(row)
        db.flush()


def on_login_failure(db: Session, ip: str) -> None:
    """Record a failed login attempt; set lockout at threshold."""
    row = _get_or_create(db, ip, _LOGIN_KIND)
    row.attempts += 1
    if row.attempts >= _MAX_ATTEMPTS and not row.lockout_until:
        row.lockout_until = _now_utc() + timedelta(minutes=_LOCKOUT_MINUTES)
    db.flush()


def on_login_success(db: Session, ip: str) -> None:
    """Clear the IP failure counter on a successful login."""
    row = db.get(IpRateLimitDBM, (ip, _LOGIN_KIND))
    if row is not None:
        db.delete(row)
        db.flush()


# ─── Registration rate limiting ───────────────────────────────────────────────

def check_registration_allowed(db: Session, ip: str) -> None:
    """Raise TooManyRequestsError if this IP has created too many accounts recently."""
    from app.core.exceptions import TooManyRequestsError
    row = db.get(IpRateLimitDBM, (ip, _REGISTER_KIND))
    if row is None:
        return
    if row.window_start is None:
        return
    now = _now_utc()
    age = (now - row.window_start).total_seconds()
    if age >= _REG_WINDOW_MINUTES * 60:
        db.delete(row)
        db.flush()
        return
    if row.attempts >= _REG_MAX_PER_WINDOW:
        secs = math.ceil(_REG_WINDOW_MINUTES * 60 - age)
        mins = math.ceil(secs / 60)
        raise TooManyRequestsError(
            f"Too many accounts created from this address. Try again in {mins} minute(s).",
            retry_after=secs,
        )


def on_registration(db: Session, ip: str) -> None:
    """Increment the registration counter for this IP in the current window."""
    row = db.get(IpRateLimitDBM, (ip, _REGISTER_KIND))
    now = _now_utc()
    if row is None:
        row = IpRateLimitDBM(ip=ip, kind=_REGISTER_KIND, attempts=1, window_start=now)
        db.add(row)
    else:
        if row.window_start and (now - row.window_start).total_seconds() >= _REG_WINDOW_MINUTES * 60:
            row.attempts = 1
            row.window_start = now
        else:
            row.attempts += 1
    db.flush()


# ─── Forgot-password rate limiting ─────────────────────────────────────────────
# Same window-counter shape as registration — this endpoint is unauthenticated
# and takes an arbitrary email, so it's an easy spam/harassment vector (flooding
# someone else's inbox with reset links) without this.

def check_forgot_password_allowed(db: Session, ip: str) -> None:
    """Raise TooManyRequestsError if this IP has requested too many resets recently."""
    from app.core.exceptions import TooManyRequestsError
    row = db.get(IpRateLimitDBM, (ip, _FORGOT_PW_KIND))
    if row is None or row.window_start is None:
        return
    now = _now_utc()
    age = (now - row.window_start).total_seconds()
    if age >= _FORGOT_PW_WINDOW_MINUTES * 60:
        db.delete(row)
        db.flush()
        return
    if row.attempts >= _FORGOT_PW_MAX_PER_WINDOW:
        secs = math.ceil(_FORGOT_PW_WINDOW_MINUTES * 60 - age)
        mins = math.ceil(secs / 60)
        raise TooManyRequestsError(
            f"Too many password reset requests. Try again in {mins} minute(s).",
            retry_after=secs,
        )


def on_forgot_password_request(db: Session, ip: str) -> None:
    """Increment the forgot-password counter for this IP in the current window."""
    row = db.get(IpRateLimitDBM, (ip, _FORGOT_PW_KIND))
    now = _now_utc()
    if row is None:
        row = IpRateLimitDBM(ip=ip, kind=_FORGOT_PW_KIND, attempts=1, window_start=now)
        db.add(row)
    else:
        if row.window_start and (now - row.window_start).total_seconds() >= _FORGOT_PW_WINDOW_MINUTES * 60:
            row.attempts = 1
            row.window_start = now
        else:
            row.attempts += 1
    db.flush()
