"""Direct local access to BackOffice's OWN backoffice.db, its backups/
directory, and its backoffice.log — the exact same technique
shadow_db_service.py uses for BackEnd_V2's shadow.db, just pointed at this
process's own files instead of a co-located sibling's. Kept as a deliberate,
separate module (not a parameterized shadow_db_service) because the two
targets genuinely have independent paths/filenames/backup-naming
conventions, and duplicating this small a file is cheaper than threading a
"which app" branch through every function in it.
"""

import logging
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError, ValidationError

logger = logging.getLogger(__name__)

_BACKUP_GLOB = "backoffice-*.db"
_BACKUP_NAME_RE = re.compile(r"^backoffice-(\d{8})-(\d{6})\d{3}\.db$")

_IST = timezone(timedelta(hours=5, minutes=30))

_LOG_SEED_LINES = 50


def _db_path() -> Path:
    """Resolved from settings.database_url rather than hardcoded — that URL
    is already the single source of truth for where backoffice.db lives
    (sqlite:///./backoffice.db by default), so this never needs its own
    separate "which directory" setting."""
    prefix = "sqlite:///"
    url = settings.database_url
    if not url.startswith(prefix):
        raise AppError("backoffice_db_service only supports sqlite:/// database URLs.")
    return Path(url[len(prefix):]).resolve()


def _backup_dir() -> Path:
    return _db_path().parent / settings.backoffice_db_backup_subdir


def _log_path() -> Path:
    return _db_path().parent / settings.backoffice_log_filename


def _json_safe_rows(cur: sqlite3.Cursor) -> tuple[list[str], list[dict]]:
    """See shadow_db_service._json_safe_rows — same reasoning, applied to
    backoffice.db's own columns (none are BLOBs today, but this stays
    correct if that ever changes)."""
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
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"
    return "application/octet-stream"


# ─── Live backoffice.db ─────────────────────────────────────────────────────

def run_sql(query: str) -> dict:
    """Executes one SQL statement directly against the live backoffice.db
    file — deliberately unrestricted, same trust level as shadow_db_service
    (both are already gated by CurrentAdmin at the route level).
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
    if not isinstance(pk, dict) or not pk:
        raise ValidationError("pk must be a non-empty object.")

    conn = sqlite3.connect(str(_db_path()))
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
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
        # Backup file names are stamped in IST (see the backup writers), so say so.
        return datetime.strptime(date_part + time_part, "%Y%m%d%H%M%S").replace(tzinfo=_IST)
    except ValueError:
        return None


def _describe_backup(path: Path) -> dict:
    stat = path.stat()
    created_at = _parse_backup_timestamp(path.name) or datetime.fromtimestamp(stat.st_mtime, tz=_IST)
    return {"name": path.name, "created_at": created_at, "size_bytes": stat.st_size}


def list_backups() -> list[dict]:
    backup_dir = _backup_dir()
    if not backup_dir.is_dir():
        return []
    entries = [_describe_backup(p) for p in backup_dir.glob(_BACKUP_GLOB)]
    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return entries


def get_backup_path(filename: str) -> Path | None:
    backup_dir = _backup_dir()
    if not backup_dir.is_dir():
        return None
    valid_names = {p.name for p in backup_dir.glob(_BACKUP_GLOB)}
    if filename not in valid_names:
        return None
    return backup_dir / filename


def _enforce_backup_limit(backup_dir: Path) -> None:
    backups = sorted(backup_dir.glob(_BACKUP_GLOB), key=lambda p: p.stat().st_mtime)
    while len(backups) > settings.backoffice_db_backup_limit:
        oldest = backups.pop(0)
        oldest.unlink()
        logger.info("backoffice_db_service: backup limit reached — deleted oldest: %s", oldest.name)


def create_backup() -> dict:
    src = _db_path()
    if not src.exists():
        raise AppError("Database file not found.")

    backup_dir = _backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)

    now = datetime.now(_IST)
    ms = now.microsecond // 1000
    dest = backup_dir / f"backoffice-{now.strftime('%Y%m%d-%H%M%S')}{ms:03d}.db"

    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
            dst_conn.commit()
        except Exception:
            dst_conn.close()
            dest.unlink(missing_ok=True)
            raise
        dst_conn.close()
    finally:
        src_conn.close()

    _enforce_backup_limit(backup_dir)
    logger.info("backoffice_db_service: backup created: %s", dest.name)
    return _describe_backup(dest)


def download_backup(filename: str) -> Path:
    path = get_backup_path(filename)
    if path is None:
        raise NotFoundError(f"Backup '{filename}' not found.")
    return path


def restore_backup(filename: str) -> dict:
    """Overwrites the live backoffice.db with a backup's contents. Note:
    this can't force this process's own SQLAlchemy connection pool to drop
    stale connections — restart BackOffice itself from the Server page
    right after a restore to guarantee every request sees the restored
    data (same caveat shadow_db_service.restore_backup documents)."""
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
        "backoffice_db_service: backoffice.db restored from backup %s (pre-restore snapshot: %s)",
        filename, pre_restore["name"],
    )
    return {"restored_from": filename, "pre_restore_backup": pre_restore}


def delete_backup(filename: str) -> dict:
    path = get_backup_path(filename)
    if path is None:
        raise NotFoundError(f"Backup '{filename}' not found.")
    path.unlink()
    logger.warning("backoffice_db_service: backup deleted: %s", filename)
    return {"deleted": filename}


def run_backup_sql(filename: str, query: str) -> dict:
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


# ─── backoffice.log ─────────────────────────────────────────────────────────

def log_exists() -> bool:
    return _log_path().exists()


def read_log_tail(n: int = _LOG_SEED_LINES) -> list[str]:
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
