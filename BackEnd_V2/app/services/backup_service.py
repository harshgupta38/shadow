import asyncio
import logging
import re
import sqlite3
from datetime import date, datetime
from pathlib import Path

from app.common import now_ist
from app.common.proc_lock import acquire_singleton_lock
from app.core.config import settings

log = logging.getLogger("uvicorn.error")

_BACKUP_GLOB = "shadow-*.db"
_BACKUP_NAME_RE = re.compile(r"^shadow-(\d{8})-(\d{6})\d{3}\.db$")

# Excluded from every backup: large, cheaply-regenerable-on-request data (TTS audio
# blobs) isn't worth carrying in every snapshot — losing it just means a user's
# next "Listen" click re-generates it for a few cents.
_EXCLUDED_TABLES = ("daily_brief_audio",)


def _strip_excluded_tables(conn: sqlite3.Connection) -> None:
    for table in _EXCLUDED_TABLES:
        conn.execute(f"DELETE FROM {table}")
    conn.commit()
    conn.execute("VACUUM")  # reclaim the space — DELETE alone doesn't shrink the file


def _parse_backup_timestamp(name: str) -> datetime | None:
    """Reads the IST timestamp create_backup() already encoded in the
    filename, rather than the file's own mtime — the name is what the
    admin panel's listing sorts by (and what makes the folder "self-
    sorting" in the first place), so this is the one true creation time
    for a backup, regardless of what timezone the filesystem reports."""
    m = _BACKUP_NAME_RE.match(name)
    if not m:
        return None
    date_part, time_part = m.groups()
    try:
        return datetime.strptime(date_part + time_part, "%Y%m%d%H%M%S")
    except ValueError:
        return None


def _sqlite_db_path() -> Path | None:
    url = settings.database_url
    if not url.startswith("sqlite:///"):
        log.warning("DB backup skipped: not a SQLite database.")
        return None
    # sqlite:///shadow.db  → shadow.db (relative to cwd)
    # sqlite:////abs/path  → /abs/path (absolute)
    return Path(url[len("sqlite:///"):])


def create_backup() -> Path | None:
    src = _sqlite_db_path()
    if src is None:
        return None

    backup_dir = Path(settings.db_backup_dir)
    backup_dir.mkdir(parents=True, exist_ok=True)

    now = now_ist()
    ms = now.microsecond // 1000
    dest = backup_dir / f"shadow-{now.strftime('%Y%m%d-%H%M%S')}{ms:03d}.db"

    if not src.exists():
        log.error("DB backup skipped: database file not found at %s", src)
        return None

    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
            _strip_excluded_tables(dst_conn)
        except Exception:
            dst_conn.close()
            dest.unlink(missing_ok=True)
            raise
        dst_conn.close()
    finally:
        src_conn.close()

    _enforce_limit(backup_dir)
    log.info("DB backup created: %s", dest.name)
    return dest


def _enforce_limit(backup_dir: Path) -> None:
    backups = sorted(
        backup_dir.glob(_BACKUP_GLOB),
        key=lambda p: p.stat().st_mtime,
    )
    while len(backups) > settings.db_backup_limit:
        oldest = backups.pop(0)
        oldest.unlink()
        log.info("DB backup limit reached — deleted oldest: %s", oldest.name)


def describe_backup(path: Path) -> dict:
    stat = path.stat()
    created_at = _parse_backup_timestamp(path.name) or datetime.fromtimestamp(stat.st_mtime)
    return {"name": path.name, "created_at": created_at, "size_bytes": stat.st_size}


def list_backups() -> list[dict]:
    """Every backup currently on disk, newest first. Sorted by each file's
    resolved created_at rather than the raw filename — the current
    YYYYMMDD-HHMMSS naming does sort correctly as a plain string, but a
    handful of backups on disk predate that format (DDMMYYYY-HHMMSS) and
    would sort into the wrong chronological position if compared as text
    (e.g. "31082026" > "20260920" lexicographically, despite 20 Sep 2026
    being the later date)."""
    backup_dir = Path(settings.db_backup_dir)
    if not backup_dir.is_dir():
        return []

    entries = [describe_backup(p) for p in backup_dir.glob(_BACKUP_GLOB)]
    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return entries


def get_backup_path(filename: str) -> Path | None:
    """Resolves `filename` to a real backup file, or None — the only
    admin-controlled path in this module, so it never trusts the string
    directly: it's only ever a hit if it's literally one of the names
    already present in the backup directory, closing off any path-
    traversal attempt regardless of what the string itself contains."""
    backup_dir = Path(settings.db_backup_dir)
    if not backup_dir.is_dir():
        return None
    valid_names = {p.name for p in backup_dir.glob(_BACKUP_GLOB)}
    if filename not in valid_names:
        return None
    return backup_dir / filename


def restore_backup(filename: str) -> dict | None:
    """Overwrites the live database with a backup's contents — the
    reverse of create_backup(), using the same SQLite online-backup API
    (safe with concurrent readers/writers, and correctly handles WAL
    checkpointing, unlike a raw file copy). Returns None if `filename`
    isn't a real backup, the live DB path can't be resolved, or the
    mandatory pre-restore snapshot itself fails — a restore never proceeds
    without first securing a way back to the state it's about to replace.

    Returns {"restored_from": ..., "pre_restore_backup": {...}} on success.
    """
    backup_path = get_backup_path(filename)
    if backup_path is None:
        return None

    live_path = _sqlite_db_path()
    if live_path is None or not live_path.exists():
        return None

    pre_restore = create_backup()
    if pre_restore is None:
        log.error("Restore aborted: could not snapshot the current database before overwriting it.")
        return None

    backup_conn = sqlite3.connect(str(backup_path))
    try:
        live_conn = sqlite3.connect(str(live_path))
        try:
            backup_conn.backup(live_conn)
        finally:
            live_conn.close()
    finally:
        backup_conn.close()

    # The running app's connection pool may still be holding connections
    # opened against the pre-restore file state — drop them all so every
    # request after this one reconnects fresh against the restored data.
    from app.db.session import engine
    engine.dispose()

    log.warning("DB restored from backup %s (pre-restore snapshot: %s)", filename, pre_restore.name)
    return {"restored_from": filename, "pre_restore_backup": describe_backup(pre_restore)}


def delete_backup(filename: str) -> bool:
    """Permanently removes a backup file. Returns False if `filename` isn't
    a real backup (same path-traversal-safe resolution as every other
    lookup here), True once the file is gone. Irreversible — there's no
    pre-delete snapshot the way restore_backup() takes one, since deleting
    a backup doesn't touch the live database at all."""
    path = get_backup_path(filename)
    if path is None:
        return False
    path.unlink()
    log.warning("Backup deleted: %s", filename)
    return True


def _is_valid_slot(slot: str) -> bool:
    """Return True if slot is a 4-digit HHMM string with a valid hour and minute."""
    if len(slot) != 4 or not slot.isdigit():
        return False
    return 0 <= int(slot[:2]) <= 23 and 0 <= int(slot[2:]) <= 59


async def backup_scheduler_loop() -> None:
    raw = settings.db_backup_runtime_list
    if not raw:
        return

    runtimes: list[tuple[str, int]] = []
    for slot in raw:
        if _is_valid_slot(slot):
            runtimes.append((slot, int(slot[:2]) * 60 + int(slot[2:])))
        else:
            log.warning(
                "DB backup: ignoring invalid runtime slot %r — "
                "expected 4-digit HHMM (e.g. '0800', '2359').",
                slot,
            )

    if not runtimes:
        log.warning("DB backup scheduler: no valid slots remain after validation, skipping.")
        return

    if not acquire_singleton_lock("backup_scheduler"):
        log.info("DB backup scheduler: another worker is already running it, skipping.")
        return

    log.info("DB backup scheduler started. Slots: %s", ", ".join(s for s, _ in runtimes))

    triggered_today: set[str] = set()
    last_date: date = now_ist().date()

    while True:
        await asyncio.sleep(30)

        now = now_ist()
        today = now.date()

        # Reset at midnight so each slot fires once per day.
        if today != last_date:
            triggered_today.clear()
            last_date = today

        current_hhmm = now.hour * 60 + now.minute
        for slot, slot_minutes in runtimes:
            if slot_minutes <= current_hhmm < slot_minutes + 2 and slot not in triggered_today:
                triggered_today.add(slot)
                try:
                    create_backup()
                except Exception:
                    log.exception("DB backup failed for slot %s", slot)
