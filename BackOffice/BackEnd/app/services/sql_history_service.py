"""History of the SQL Console: the last queries an admin ran per app, with their output.

Stored on the server (not in the browser) so it survives a reload, follows the admin to another
device, and doesn't leave query results sitting in plaintext browser storage. Output is the first page
of the result, the same page the console showed when the query ran.
"""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.sql_history import SqlHistoryDBM

logger = logging.getLogger(__name__)

MAX_ENTRIES = 30
# A page can hold wide rows (JSON columns, long text). Past this, rows are dropped from the saved copy
# so thirty entries can never add up to an enormous payload on every console load.
MAX_RESULT_BYTES = 64 * 1024

_RESULT_KEYS = ("columns", "rows", "rowcount", "total", "page", "page_size")


def _serialize_result(result: dict) -> tuple[str, bool]:
    payload = {key: result.get(key) for key in _RESULT_KEYS}
    text = json.dumps(payload, default=str)
    if len(text) <= MAX_RESULT_BYTES:
        return text, False

    rows = payload["rows"] or []
    while rows and len(text) > MAX_RESULT_BYTES:
        rows = rows[: len(rows) // 2]
        payload["rows"] = rows
        text = json.dumps(payload, default=str)
    return text, True


def record(
    db: Session,
    admin_email: str,
    app: str,
    query: str,
    *,
    result: dict | None = None,
    error: str | None = None,
    duration_ms: int | None = None,
) -> None:
    """Saves one run. History is a convenience, so a failure here must never fail the query itself."""
    try:
        result_json, truncated = _serialize_result(result) if result is not None else (None, False)

        newest = db.scalar(
            select(SqlHistoryDBM)
            .where(SqlHistoryDBM.admin_email == admin_email, SqlHistoryDBM.app == app)
            .order_by(SqlHistoryDBM.id.desc())
            .limit(1)
        )
        # Running the same query again replaces its entry (new output, new time) instead of filling the
        # thirty slots with copies, the way a shell collapses repeated commands.
        entry = newest if newest is not None and newest.query == query else SqlHistoryDBM(
            admin_email=admin_email, app=app, query=query,
        )
        entry.success = error is None
        entry.result_json = result_json
        entry.error_message = error
        entry.truncated = truncated
        entry.duration_ms = duration_ms
        entry.executed_at = datetime.now(timezone.utc)
        db.add(entry)
        db.flush()

        stale_ids = db.scalars(
            select(SqlHistoryDBM.id)
            .where(SqlHistoryDBM.admin_email == admin_email, SqlHistoryDBM.app == app)
            .order_by(SqlHistoryDBM.id.desc())
            .offset(MAX_ENTRIES)
        ).all()
        if stale_ids:
            db.execute(delete(SqlHistoryDBM).where(SqlHistoryDBM.id.in_(stale_ids)))
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("Could not save SQL console history.", exc_info=True)


def list_history(db: Session, admin_email: str, app: str) -> list[dict]:
    """Newest first."""
    rows = db.scalars(
        select(SqlHistoryDBM)
        .where(SqlHistoryDBM.admin_email == admin_email, SqlHistoryDBM.app == app)
        .order_by(SqlHistoryDBM.id.desc())
        .limit(MAX_ENTRIES)
    ).all()
    return [
        {
            "id": row.id,
            "query": row.query,
            "success": row.success,
            "result": json.loads(row.result_json) if row.result_json else None,
            "error_message": row.error_message,
            "truncated": row.truncated,
            "duration_ms": row.duration_ms,
            "executed_at": row.executed_at,
        }
        for row in rows
    ]


def clear_history(db: Session, admin_email: str, app: str) -> None:
    db.execute(delete(SqlHistoryDBM).where(SqlHistoryDBM.admin_email == admin_email, SqlHistoryDBM.app == app))
    db.commit()
