import hashlib
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import update, or_
from sqlalchemy.orm import Session

from app.models.active_session import ActiveSessionDBM
from app.schemas.session import SessionInfoResponse


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def set_refresh_token_hash(session: ActiveSessionDBM, token: str) -> None:
    """Sets the hash on a new session object (login/register path, pre-commit)."""
    session.refresh_token_hash = _hash_token(token)


def rotate_refresh_token_hash(
    db: Session,
    session_id: int,
    user_id: int,
    old_token: str,
    new_token: str,
) -> bool:
    """Atomic compare-and-swap: updates the hash only when the stored value
    matches old_token (or is NULL for sessions created before rotation was
    introduced — one-time grace period, after which full enforcement applies).
    Returns False if the swap fails, meaning the token was already rotated
    (concurrent request) or is a replay of an old token.
    """
    old_hash = _hash_token(old_token)
    new_hash = _hash_token(new_token)
    result = db.execute(
        update(ActiveSessionDBM)
        .where(
            ActiveSessionDBM.id == session_id,
            ActiveSessionDBM.user_id == user_id,
            or_(
                ActiveSessionDBM.refresh_token_hash == old_hash,
                ActiveSessionDBM.refresh_token_hash.is_(None),
            ),
        )
        .values(refresh_token_hash=new_hash)
    )
    db.commit()
    return result.rowcount == 1


def parse_user_agent(ua: str) -> tuple[str, str, str]:
    """Parses a User-Agent string into (device_name, browser, os_name)."""
    ua = ua or ""

    # OS / device detection
    if "Android" in ua:
        os_name = "Android"
        device_name = "Android Tablet" if "Tablet" in ua else "Android Phone"
    elif "iPad" in ua:
        os_name = "iOS"
        device_name = "iPad"
    elif "iPhone" in ua:
        os_name = "iOS"
        device_name = "iPhone"
    elif "Windows" in ua:
        os_name = "Windows"
        device_name = "Windows PC"
    elif "Macintosh" in ua or "Mac OS" in ua:
        os_name = "macOS"
        device_name = "Mac"
    elif "Linux" in ua:
        os_name = "Linux"
        device_name = "Linux PC"
    else:
        os_name = "Unknown"
        device_name = "Unknown Device"

    # Browser detection — order matters (Edge/Opera before Chrome)
    if "Edg/" in ua or "Edge/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "Chrome/" in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "Unknown"

    return device_name, browser, os_name


def create_session(db: Session, user_id: int, request: Request) -> ActiveSessionDBM:
    ua = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else None
    device_name, browser, os_name = parse_user_agent(ua)

    session = ActiveSessionDBM(
        user_id=user_id,
        device_name=device_name,
        browser=browser,
        os_name=os_name,
        ip_address=ip,
    )
    db.add(session)
    db.flush()  # obtain id without committing yet
    return session


def get_sessions(
    db: Session, user_id: int, current_session_id: int | None = None
) -> list[SessionInfoResponse]:
    rows = (
        db.query(ActiveSessionDBM)
        .filter(
            ActiveSessionDBM.user_id == user_id,
            or_(
                ActiveSessionDBM.confirmed.is_(True),
                ActiveSessionDBM.id == current_session_id,
            ),
        )
        .order_by(ActiveSessionDBM.created_at.desc())
        .all()
    )
    return [
        SessionInfoResponse(
            id=row.id,
            device_name=row.device_name,
            custom_name=row.custom_name,
            browser=row.browser,
            os_name=row.os_name,
            ip_address=row.ip_address,
            last_seen_at=row.last_seen_at,
            created_at=row.created_at,
            is_current=(row.id == current_session_id),
        )
        for row in rows
    ]


def get_session_count(db: Session, user_id: int, include_session_id: int | None = None) -> int:
    """Counts confirmed sessions (real, used-at-least-once devices).

    include_session_id lets a caller count a session that was just created in
    this same request and hasn't had a chance to be confirmed yet (e.g. the
    login response itself) — without it, unconfirmed "phantom" sessions from
    failed logins are correctly excluded from the device-limit count.
    """
    return (
        db.query(ActiveSessionDBM)
        .filter(
            ActiveSessionDBM.user_id == user_id,
            or_(
                ActiveSessionDBM.confirmed.is_(True),
                ActiveSessionDBM.id == include_session_id,
            ),
        )
        .count()
    )


def rename_session(db: Session, session_id: int, user_id: int, custom_name: str | None) -> bool:
    """Sets (or clears) the user-chosen display name for a session.

    An empty/whitespace-only name clears the override, so the UI falls back
    to the auto-detected device_name.
    """
    row = (
        db.query(ActiveSessionDBM)
        .filter(ActiveSessionDBM.id == session_id, ActiveSessionDBM.user_id == user_id)
        .first()
    )
    if not row:
        return False
    cleaned = (custom_name or "").strip()
    row.custom_name = cleaned or None
    db.commit()
    return True


def revoke_session(db: Session, session_id: int, user_id: int) -> bool:
    row = (
        db.query(ActiveSessionDBM)
        .filter(ActiveSessionDBM.id == session_id, ActiveSessionDBM.user_id == user_id)
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def revoke_all_sessions(db: Session, user_id: int) -> None:
    """Signs the user out of every device — used by account deactivation."""
    db.query(ActiveSessionDBM).filter(ActiveSessionDBM.user_id == user_id).delete()
    db.commit()


def revoke_other_sessions(db: Session, user_id: int, keep_session_id: int | None) -> None:
    """Signs the user out of every device except the one making this request —
    used after a password change so a session hijacked elsewhere is cut off
    without logging the user out of the device they just used to change it.
    Falls back to revoking everything if the current session couldn't be
    identified (safer than leaving an unknown set of sessions alive)."""
    query = db.query(ActiveSessionDBM).filter(ActiveSessionDBM.user_id == user_id)
    if keep_session_id is not None:
        query = query.filter(ActiveSessionDBM.id != keep_session_id)
    query.delete()
    db.commit()


def update_last_seen(db: Session, session: ActiveSessionDBM) -> None:
    now = datetime.now(timezone.utc)
    last = session.last_seen_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    dirty = False
    just_confirmed = False
    # First successful use of this session — see ActiveSessionDBM.confirmed.
    if not session.confirmed:
        session.confirmed = True
        dirty = True
        just_confirmed = True
    # Only write last_seen_at if stale by more than 5 minutes to reduce DB pressure
    if (now - last).total_seconds() > 300:
        session.last_seen_at = now
        dirty = True

    if dirty:
        db.commit()

    if just_confirmed:
        _notify_new_signin(db, session)


def _notify_new_signin(db: Session, session: ActiveSessionDBM) -> None:
    from app.models.user import UserDBM
    from app.services import notifications_service

    user = db.get(UserDBM, session.user_id)
    if not user:
        return
    notifications_service.create_notification(
        db, user,
        title="New sign-in detected",
        body=f"A new session was started from {session.device_name} ({session.browser} on {session.os_name}).",
        type="system",
        priority=1,
        event_key=f"signin:{session.id}",
    )
