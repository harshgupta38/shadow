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

from app.core import security
from app.core.config import settings
from app.core.exceptions import ForbiddenError, ValidationError
from app.models.admin_user import AdminUserDBM
from app.schemas.users import CreateAdminRequest, UserStatus
from app.services import shadow_client

_AWAY_AFTER = timedelta(hours=1)
_INACTIVE_AFTER = timedelta(days=7)


def _normalise_email(email: str) -> str:
    return email.strip().lower()


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

    age = datetime.now(timezone.utc).replace(tzinfo=None) - last_seen
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


def _admin_to_dict(admin: AdminUserDBM) -> dict:
    return {
        "id": admin.id,
        "name": admin.name,
        "email": admin.email,
        "email_verified": None,
        "created_at": admin.created_at,
        "status": _compute_status(admin.is_active, admin.last_login_at),
    }


def list_backoffice_users(db: Session) -> list[dict]:
    admins = db.query(AdminUserDBM).order_by(AdminUserDBM.id).all()
    return [_admin_to_dict(a) for a in admins]


def create_backoffice_admin(db: Session, actor: AdminUserDBM, data: CreateAdminRequest) -> dict:
    """Creates a new BackOffice admin. Requires two independent checks beyond
    the caller's own session cookie: their own current password (step-up
    auth — a stolen session alone isn't enough) and the NEW_ADMIN_SECRET
    (an out-of-band secret only someone with .env access can supply).

    A wrong current_password is a form validation failure (400), not an
    AuthError (401) — the caller's session is still perfectly valid, and a
    401 here would trip the frontend's global "session died" interceptor
    and boot them out of BackOffice over a typo in this dialog.
    """
    if data.secret_key != settings.new_admin_secret:
        raise ForbiddenError("Invalid secret key.")

    if not security.verify_password(data.current_password, actor.hashed_password):
        raise ValidationError(
            "Incorrect password.",
            errors={"current_password": "Incorrect password."},
        )

    email = _normalise_email(data.email)
    existing = db.query(AdminUserDBM).filter(AdminUserDBM.email == email).first()
    if existing:
        raise ValidationError(
            "An admin with this email already exists.",
            errors={"email": "An admin with this email already exists."},
        )

    admin = AdminUserDBM(
        name=data.name.strip(),
        email=email,
        hashed_password=security.hash_password(data.password),
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return _admin_to_dict(admin)
