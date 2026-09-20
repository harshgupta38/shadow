"""Users listing for both managed apps.

Shadow V2's users come from shadow.db via shadow_client (same path the
Database page already uses — never a second SQL-execution mechanism).
BackOffice's own admins are read directly, since that's BackOffice's own
database.

Status (active / away / inactive) is a recency signal, not the account's own
is_active flag (which only means "not deactivated" — unrelated to when they
were last seen). It's computed from:
  * Shadow users: the most recent `active_sessions.last_seen_at` row for
    that user — a user can have several sessions (multiple devices), so the
    freshest one wins.
  * BackOffice admins: `admin_users.last_login_at` — there's no per-session
    table on this side, so it's the closest equivalent BackOffice has.
A deactivated account (is_active=false) always reads as "inactive"
regardless of recency — an account that can no longer log in isn't "active"
no matter how recently it was seen before being deactivated.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.admin_user import AdminUserDBM
from app.schemas.users import UserStatus
from app.services import shadow_client

_AWAY_AFTER = timedelta(hours=1)
_INACTIVE_AFTER = timedelta(days=7)


def _to_naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _parse_sqlite_datetime(value: str | None) -> datetime | None:
    """Raw sqlite3 (no ORM) hands datetime columns back as plain text —
    typically "YYYY-MM-DD HH:MM:SS[.ffffff]". Never crash on an unexpected
    format; an unparsable timestamp should just read as "never seen"."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace(" ", "T", 1))
    except ValueError:
        return None


def _compute_status(is_active: bool, last_seen: datetime | None) -> UserStatus:
    if not is_active:
        return "inactive"

    last_seen = _to_naive_utc(last_seen)
    if last_seen is None:
        return "inactive"

    age = datetime.utcnow() - last_seen
    if age <= _AWAY_AFTER:
        return "active"
    if age <= _INACTIVE_AFTER:
        return "away"
    return "inactive"


def list_shadow_users() -> list[dict]:
    result = shadow_client.run_sql(
        "SELECT u.id, u.name, u.email, u.is_active, u.email_verified, u.created_at, "
        "MAX(s.last_seen_at) AS last_seen_at "
        "FROM users u LEFT JOIN active_sessions s ON s.user_id = u.id "
        "GROUP BY u.id ORDER BY u.id"
    )

    users = []
    for row in result["rows"]:
        last_seen = _parse_sqlite_datetime(row.get("last_seen_at"))
        created_at = _parse_sqlite_datetime(row.get("created_at"))
        users.append({
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "email_verified": bool(row["email_verified"]),
            "created_at": created_at,
            "status": _compute_status(bool(row["is_active"]), last_seen),
        })
    return users


def list_backoffice_users(db: Session) -> list[dict]:
    admins = db.query(AdminUserDBM).order_by(AdminUserDBM.id).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "email": a.email,
            "email_verified": None,
            "created_at": a.created_at,
            "status": _compute_status(a.is_active, a.last_login_at),
        }
        for a in admins
    ]
