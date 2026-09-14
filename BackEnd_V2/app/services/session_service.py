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


def _parse_user_agent(ua: str) -> tuple[str, str, str]:
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
    device_name, browser, os_name = _parse_user_agent(ua)

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
        .filter(ActiveSessionDBM.user_id == user_id)
        .order_by(ActiveSessionDBM.created_at.desc())
        .all()
    )
    return [
        SessionInfoResponse(
            id=row.id,
            device_name=row.device_name,
            browser=row.browser,
            os_name=row.os_name,
            ip_address=row.ip_address,
            last_seen_at=row.last_seen_at,
            created_at=row.created_at,
            is_current=(row.id == current_session_id),
        )
        for row in rows
    ]


def get_session_count(db: Session, user_id: int) -> int:
    return (
        db.query(ActiveSessionDBM)
        .filter(ActiveSessionDBM.user_id == user_id)
        .count()
    )


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


def update_last_seen(db: Session, session: ActiveSessionDBM) -> None:
    now = datetime.now(timezone.utc)
    last = session.last_seen_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    # Only write if stale by more than 5 minutes to reduce DB pressure
    if (now - last).total_seconds() > 300:
        session.last_seen_at = now
        db.commit()
