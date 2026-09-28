"""BackOffice's "Delete User" action for Shadow V2 users, and the read-only
archive it writes to.

Deleting a shadow.db user is never a plain `DELETE FROM users` — every
table that (directly or transitively) belongs to that user needs its data
preserved somewhere a developer can still look it up later, not just wiped.
So the flow is always, in order:

  1. A permanent `deleted-user-{email}-...` safety backup of the whole live
     shadow.db (see shadow_db_service.create_backup(label=...)) — never
     pruned by the routine backup rotation.
  2. Every row belonging to this user copied into deleted_data.db, which
     lives in BackOffice's OWN directory (not shadow.db's) since this is
     BackOffice's bookkeeping, not something BackEnd_V2 needs to know about.
  3. Those same rows removed from the live shadow.db.

Which tables "belong" to a user is never hardcoded: it's discovered fresh,
every time, by walking shadow.db's live `PRAGMA foreign_key_list` graph
outward from `users` (see _build_owned_selectors). A table added to
BackEnd_V2's models later that also references users.id (directly, or
transitively through another owned table) is picked up automatically here,
with no code change required.
"""

import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError, ValidationError
from app.services import shadow_db_service

logger = logging.getLogger(__name__)

_IST = timezone(timedelta(hours=5, minutes=30))


def _db_path() -> Path:
    """Resolved from settings.database_url's directory, same convention as
    backoffice_db_service._db_path() — deleted_data.db always lives right
    beside backoffice.db, never a separately configured directory."""
    prefix = "sqlite:///"
    url = settings.database_url
    if not url.startswith(prefix):
        raise AppError("deleted_data_service only supports sqlite:/// database URLs.")
    return (Path(url[len(prefix):]).resolve().parent / settings.deleted_data_db_filename)


def _json_safe_rows(cur: sqlite3.Cursor) -> tuple[list[str], list[dict]]:
    """Same BLOB-placeholder treatment as shadow_db_service._json_safe_rows
    (a deliberate small duplication, not a shared import, see that
    module's own docstring for why) so browsing deleted_data.db never fails
    to serialize a row with binary data (e.g. an archived daily_brief_audio
    row) any differently than browsing the live database does."""
    columns = [d[0] for d in cur.description] if cur.description else []
    rows = []
    for sqlite_row in cur.fetchall():
        row = dict(sqlite_row)
        for key, value in row.items():
            if isinstance(value, (bytes, bytearray)):
                row[key] = {"__binary__": True, "size_bytes": len(value)}
        rows.append(row)
    return columns, rows


def run_sql(query: str) -> dict:
    """Read-only browsing for the Database page's "Deleted Data" tab -
    same shape as shadow_db_service.run_backup_sql(), opened via SQLite's
    own mode=ro URI so a write attempt fails regardless of what's sent.
    Before any user has ever been deleted the file doesn't exist yet, so
    that reads as "no tables" rather than an error."""
    path = _db_path()
    if not path.exists():
        return {"rowcount": 0, "columns": [], "rows": []}

    conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(query)
        columns, rows = _json_safe_rows(cur)
        return {"rowcount": cur.rowcount, "columns": columns, "rows": rows}
    except Exception as e:
        raise AppError(str(e))
    finally:
        conn.close()


def _all_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'"
    ).fetchall()
    return [r["name"] for r in rows]


def _fk_list(conn: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return conn.execute(f'PRAGMA foreign_key_list("{table}")').fetchall()


def _build_owned_selectors(conn: sqlite3.Connection) -> tuple[dict[str, str], dict[str, int]]:
    """Breadth-first walk of the live FK graph, starting from `users`.
    Returns (selectors, depth): selectors[table] is the SQL fragment
    (bound to :user_id) selecting that table's owned rows; depth[table] is
    its BFS distance from `users`, used purely to order deletion so child
    tables are always processed before the parent they reference.

    Ties (a table with more than one path back to `users`) prefer
    whichever path is shortest, so a table with both its own `user_id`
    column AND a nullable FK to another owned table (e.g. `milestones` has
    both `user_id` and `goal_id`) resolves via the direct column, not by
    joining through the other table.
    """
    tables = _all_tables(conn)
    fk_by_table = {t: _fk_list(conn, t) for t in tables}

    depth: dict[str, int] = {"users": 0}
    selectors: dict[str, str] = {"users": '"id" = :user_id'}

    progress = True
    while progress:
        progress = False
        for table in tables:
            if table in depth:
                continue
            best: tuple[int, sqlite3.Row] | None = None
            for fk in fk_by_table[table]:
                ref_table = fk["table"]
                if ref_table in depth:
                    candidate = depth[ref_table] + 1
                    if best is None or candidate < best[0]:
                        best = (candidate, fk)
            if best is not None:
                candidate_depth, fk = best
                ref_table, from_col, to_col = fk["table"], fk["from"], fk["to"] or "id"
                if ref_table == "users":
                    where = f'"{from_col}" = :user_id'
                else:
                    where = f'"{from_col}" IN (SELECT "{to_col}" FROM "{ref_table}" WHERE {selectors[ref_table]})'
                selectors[table] = where
                depth[table] = candidate_depth
                progress = True

    return selectors, depth


def archive_and_delete_user(user_id: int, confirm_email: str, deleted_by: str) -> dict:
    """The three steps described in this module's docstring, all inside one
    SQLite cross-database transaction (via ATTACH) so a failure partway
    through leaves the live shadow.db completely untouched rather than
    half-deleted - either every owned row across every table moves and is
    removed, or none of it does.

    `confirm_email` must match the target user's actual email - checked
    here, server-side, rather than trusted from whatever the admin UI's
    confirmation input happened to send.
    """
    src = shadow_db_service._db_path()
    if not src.exists():
        raise AppError("shadow.db not found.")

    conn = sqlite3.connect(str(src))
    conn.row_factory = sqlite3.Row
    try:
        user_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if user_row is None:
            raise NotFoundError(f"User {user_id} not found.")
        email = user_row["email"]
        name = user_row["name"]

        if confirm_email.strip().lower() != email.strip().lower():
            raise ValidationError("Typed email does not match this user's email - deletion cancelled.")

        backup = shadow_db_service.create_backup(label=email)

        selectors, depth = _build_owned_selectors(conn)
        # Deepest (child) tables first, so a child selector that reads a
        # parent table (e.g. messages -> conversations) still finds that
        # parent's rows in place when it runs; `users` itself goes last.
        ordered = sorted((t for t in depth if t != "users"), key=lambda t: -depth[t])
        ordered.append("users")

        dest_path = _db_path()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        conn.execute("ATTACH DATABASE ? AS deleted_data", (str(dest_path),))

        counts: dict[str, int] = {}
        try:
            for table in ordered:
                where = selectors[table]
                conn.execute(
                    f'CREATE TABLE IF NOT EXISTS deleted_data."{table}" AS '
                    f'SELECT * FROM main."{table}" WHERE 0'
                )
                conn.execute(
                    f'INSERT INTO deleted_data."{table}" SELECT * FROM main."{table}" WHERE {where}',
                    {"user_id": user_id},
                )
                cur = conn.execute(f'DELETE FROM main."{table}" WHERE {where}', {"user_id": user_id})
                counts[table] = cur.rowcount

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS deleted_data.deletion_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_user_id INTEGER NOT NULL,
                    email TEXT NOT NULL,
                    name TEXT,
                    deleted_by TEXT,
                    deleted_at TEXT NOT NULL,
                    backup_filename TEXT,
                    tables_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "INSERT INTO deleted_data.deletion_log "
                "(original_user_id, email, name, deleted_by, deleted_at, backup_filename, tables_json) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    user_id, email, name, deleted_by,
                    datetime.now(_IST).isoformat(),
                    backup["name"],
                    json.dumps(counts),
                ),
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.execute("DETACH DATABASE deleted_data")
    finally:
        conn.close()

    logger.warning(
        "deleted_data_service: user %s (%s) deleted by %s; archived rows: %s (safety backup: %s)",
        user_id, email, deleted_by, counts, backup["name"],
    )
    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "archived_rows": counts,
        "backup_filename": backup["name"],
    }
