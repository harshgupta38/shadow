"""Direct local access to BackEnd_V2's shadow.db, its backups/ directory,
and its server.log.

This replaces the old HTTP round-trip through BackEnd_V2's `/admin/*`
endpoints (an X-Admin-Secret header shared between two separate .env
files, guarding routes that existed there solely for this app to call).
BackOffice and BackEnd_V2 are confirmed co-located on the same device (see
`shadow_backend_dir` in config.py — `worker_service.py` already reads that
same directory for process introspection), so there is no longer any
reason to hop through a second HTTP server just to run a SQL statement or
read a file this process can already open itself. Every route that calls
into this module is already gated by BackOffice's own CurrentAdmin auth,
so retiring that second secret loses no security — it just removes a
duplicate one.

`app/services/backup_service.py` in BackEnd_V2 still exists and still owns
backup creation for its OWN scheduled backups (called directly by its own
asyncio loop, never over HTTP) — the backup create/list/restore/delete
logic below is a deliberate, small duplication of that file's SQLite
backup-API technique and `shadow-YYYYMMDD-HHMMSS<ms>.db` naming
convention, not a shared import. These are two independently deployable
apps that simply happen to share a filesystem in production; keep the two
in sync by hand if that naming convention ever changes.
"""

import logging
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError, ValidationError

logger = logging.getLogger(__name__)

_BACKUP_GLOB = "shadow-*.db"
_BACKUP_NAME_RE = re.compile(r"^shadow-(\d{8})-(\d{6})\d{3}\.db$")

# Same exclusion as BackEnd_V2's backup_service.py — large, cheaply
# regenerable-on-request TTS audio blobs aren't worth carrying in every
# snapshot this app creates either.
_EXCLUDED_TABLES = ("daily_brief_audio",)

_IST = timezone(timedelta(hours=5, minutes=30))

_LOG_SEED_LINES = 50


def _backend_dir() -> Path:
    return Path(settings.shadow_backend_dir).expanduser()


def _db_path() -> Path:
    return _backend_dir() / settings.shadow_db_filename


def _backup_dir() -> Path:
    return _backend_dir() / settings.shadow_db_backup_subdir


def _log_path() -> Path:
    return _backend_dir() / settings.shadow_server_log_filename


def _json_safe_rows(cur: sqlite3.Cursor) -> tuple[list[str], list[dict]]:
    """A BLOB column (e.g. daily_brief_audio.audio_data) comes back from
    sqlite3 as raw `bytes` — not JSON-serializable, so returning it as-is
    from a route makes FastAPI fail on response encoding. Every bytes
    value is replaced with a small placeholder describing it instead; the
    actual bytes are only ever fetched one cell at a time via get_blob().
    """
    columns = [d[0] for d in cur.description] if cur.description else []
    rows = []
    for sqlite_row in cur.fetchall():
        row = dict(sqlite_row)
        for key, value in row.items():
            if isinstance(value, (bytes, bytearray)):
                row[key] = {"__binary__": True, "size_bytes": len(value)}
        rows.append(row)
    return columns, rows


def _sniff_blob_mime(data: bytes) -> str:
    """Best-effort content-type for a raw blob so a browser can play it
    inline instead of just downloading it. Only the encoding this app's
    own pipeline actually produces (MP3 via OpenAI TTS for daily-brief
    audio) is worth detecting by magic bytes; anything else falls back to
    a generic download."""
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"
    return "application/octet-stream"


# ─── Live shadow.db ─────────────────────────────────────────────────────────

def run_sql(query: str) -> dict:
    """Executes one SQL statement directly against the live shadow.db
    file — deliberately unrestricted (the SQL Console's whole point),
    same trust level BackEnd_V2's old /admin/sql had.
    """
    conn = sqlite3.connect(str(_db_path()))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(query)
        conn.commit()
        columns, rows = _json_safe_rows(cur)
        return {"rowcount": cur.rowcount, "columns": columns, "rows": rows}
    except Exception as e:
        conn.rollback()
        raise AppError(str(e))
    finally:
        conn.close()


def get_blob(table: str, column: str, pk: dict) -> tuple[bytes, str]:
    """Fetches one BLOB cell's actual bytes — the counterpart to run_sql(),
    which only ever returns binary columns as a {size_bytes} placeholder
    (see _json_safe_rows above) so listing a table with one doesn't fail
    to serialize.
    """
    if not isinstance(pk, dict) or not pk:
        raise ValidationError("pk must be a non-empty object.")

    conn = sqlite3.connect(str(_db_path()))
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()

        # Table/column names are only ever used below once confirmed to be an
        # exact match against the live schema itself — never interpolated
        # straight from the request.
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", (table,))
        if cur.fetchone() is None:
            raise NotFoundError(f"Table '{table}' does not exist.")

        cur.execute(f'PRAGMA table_info("{table}")')
        table_columns = {row["name"]: row for row in cur.fetchall()}
        if column not in table_columns:
            raise NotFoundError(f"Column '{column}' does not exist on '{table}'.")

        pk_columns = {name for name, row in table_columns.items() if row["pk"] > 0}
        if set(pk.keys()) != pk_columns:
            raise ValidationError(f"Primary key value(s) required: {', '.join(sorted(pk_columns))}")

        where_sql = " AND ".join(f'"{c}" = ?' for c in pk)
        select_query = f'SELECT "{column}" FROM "{table}" WHERE {where_sql} LIMIT 1'
        cur.execute(select_query, tuple(pk[c] for c in pk))
        row = cur.fetchone()
        if row is None:
            raise NotFoundError("Row not found.")

        value = row[0]
        if not isinstance(value, (bytes, bytearray)):
            raise ValidationError(f"Column '{column}' does not hold binary data.")

        return bytes(value), _sniff_blob_mime(value)
    finally:
        conn.close()


# ─── Backups ────────────────────────────────────────────────────────────────

def _parse_backup_timestamp(name: str) -> datetime | None:
    m = _BACKUP_NAME_RE.match(name)
    if not m:
        return None
    date_part, time_part = m.groups()
    try:
        return datetime.strptime(date_part + time_part, "%Y%m%d%H%M%S")
    except ValueError:
        return None


def _describe_backup(path: Path) -> dict:
    stat = path.stat()
    created_at = _parse_backup_timestamp(path.name) or datetime.fromtimestamp(stat.st_mtime)
    return {"name": path.name, "created_at": created_at, "size_bytes": stat.st_size}


def list_backups() -> list[dict]:
    """Every backup currently on disk (BackEnd_V2's own scheduled ones and
    any BackOffice has triggered manually live in the same directory),
    newest first — same resolved-created_at sort as BackEnd_V2's own
    listing used, so legacy pre-rename backups still sort correctly."""
    backup_dir = _backup_dir()
    if not backup_dir.is_dir():
        return []
    entries = [_describe_backup(p) for p in backup_dir.glob(_BACKUP_GLOB)]
    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return entries


def get_backup_path(filename: str) -> Path | None:
    """Resolves `filename` to a real backup file, or None — never trusts
    the string directly: it's only ever a hit if it's literally one of the
    names already present in the backup directory, closing off any
    path-traversal attempt regardless of what the string itself contains.
    """
    backup_dir = _backup_dir()
    if not backup_dir.is_dir():
        return None
    valid_names = {p.name for p in backup_dir.glob(_BACKUP_GLOB)}
    if filename not in valid_names:
        return None
    return backup_dir / filename


def _enforce_backup_limit(backup_dir: Path) -> None:
    backups = sorted(backup_dir.glob(_BACKUP_GLOB), key=lambda p: p.stat().st_mtime)
    while len(backups) > settings.shadow_db_backup_limit:
        oldest = backups.pop(0)
        oldest.unlink()
        logger.info("shadow_db_service: backup limit reached — deleted oldest: %s", oldest.name)


def create_backup() -> dict:
    """Snapshots the live shadow.db via SQLite's own online-backup API
    (safe with concurrent readers/writers) into backups/, using the same
    IST-timestamped filename convention as BackEnd_V2's scheduled backups
    so both sort and parse correctly side by side in one directory.
    """
    src = _db_path()
    if not src.exists():
        raise AppError("Database file not found.")

    backup_dir = _backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(_IST)
    ms = now.microsecond // 1000
    dest = backup_dir / f"shadow-{now.strftime('%Y%m%d-%H%M%S')}{ms:03d}.db"

    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
            for table in _EXCLUDED_TABLES:
                dst_conn.execute(f"DELETE FROM {table}")
            dst_conn.commit()
            dst_conn.execute("VACUUM")  # reclaim space — DELETE alone doesn't shrink the file
        except Exception:
            dst_conn.close()
            dest.unlink(missing_ok=True)
            raise
        dst_conn.close()
    finally:
        src_conn.close()

    _enforce_backup_limit(backup_dir)
    logger.info("shadow_db_service: backup created: %s", dest.name)
    return _describe_backup(dest)


def download_backup(filename: str) -> Path:
    path = get_backup_path(filename)
    if path is None:
        raise NotFoundError(f"Backup '{filename}' not found.")
    return path


def restore_backup(filename: str) -> dict:
    """Overwrites the live shadow.db with a backup's contents — the
    reverse of create_backup(), using the same SQLite online-backup API
    (correctly handles WAL checkpointing, unlike a raw file copy). A fresh
    safety snapshot of the CURRENT database is taken first, so a restore
    never proceeds without a way back to the state it's about to replace.

    Note: unlike the old in-process BackEnd_V2 endpoint, this can't call
    that process's `engine.dispose()` to force its SQLAlchemy pool to drop
    stale connections — restart BackEnd_V2 from the Server page right
    after a restore to guarantee every request sees the restored data.
    """
    backup_path = get_backup_path(filename)
    if backup_path is None:
        raise NotFoundError(f"Backup '{filename}' not found.")

    live_path = _db_path()
    if not live_path.exists():
        raise AppError("Live database file not found.")

    pre_restore = create_backup()

    backup_conn = sqlite3.connect(str(backup_path))
    try:
        live_conn = sqlite3.connect(str(live_path))
        try:
            backup_conn.backup(live_conn)
        finally:
            live_conn.close()
    finally:
        backup_conn.close()

    logger.warning(
        "shadow_db_service: shadow.db restored from backup %s (pre-restore snapshot: %s)",
        filename, pre_restore["name"],
    )
    return {"restored_from": filename, "pre_restore_backup": pre_restore}


def delete_backup(filename: str) -> dict:
    """Permanently removes a backup file. Irreversible — there's no
    pre-delete snapshot the way restore_backup() takes one, since deleting
    a backup doesn't touch the live database at all."""
    path = get_backup_path(filename)
    if path is None:
        raise NotFoundError(f"Backup '{filename}' not found.")
    path.unlink()
    logger.warning("shadow_db_service: backup deleted: %s", filename)
    return {"deleted": filename}


def run_backup_sql(filename: str, query: str) -> dict:
    """Executes one read-only SQL statement against a specific backup
    file — opened via SQLite's own `mode=ro` URI, so a write attempt fails
    there regardless of what's sent here."""
    path = get_backup_path(filename)
    if path is None:
        raise NotFoundError(f"Backup '{filename}' not found.")

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


# ─── server.log ─────────────────────────────────────────────────────────────

def log_exists() -> bool:
    return _log_path().exists()


def read_log_tail(n: int = _LOG_SEED_LINES) -> list[str]:
    """Approximates `tail -n N` by reading backward in fixed-size chunks
    until at least N newlines are seen (or the start of the file) —
    reading the whole file into memory just to keep its last few lines
    gets worse as the file grows. Used to seed a freshly opened log
    websocket with recent context."""
    path = _log_path()
    if not path.exists():
        return []

    chunk_size = 8192
    block = b""
    with path.open("rb") as f:
        f.seek(0, 2)
        remaining = f.tell()
        while remaining > 0 and block.count(b"\n") <= n:
            read_size = min(chunk_size, remaining)
            remaining -= read_size
            f.seek(remaining)
            block = f.read(read_size) + block
    text = block.decode("utf-8", errors="replace")
    return text.splitlines()[-n:]


def log_size() -> int:
    try:
        return _log_path().stat().st_size
    except OSError:
        return 0


def read_log_since(position: int) -> tuple[str, int]:
    """Bytes appended to server.log since `position`, and the new
    position to poll from next. Handles rotation/truncation (current size
    smaller than the last known position — restart_server.sh overwrites
    this file on every restart) by restarting from the top."""
    path = _log_path()
    try:
        size = path.stat().st_size
    except OSError:
        return "", position

    if size < position:
        position = 0
    if size <= position:
        return "", position

    with path.open("r", encoding="utf-8", errors="replace") as f:
        f.seek(position)
        text = f.read()
        new_position = f.tell()
    return text, new_position
