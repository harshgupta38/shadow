import asyncio
import logging
import os
import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import IO

from app.core.config import settings

log = logging.getLogger("uvicorn.error")

_LOCK_FILE = Path(".backup_scheduler.lock")
_lock_fh: IO | None = None  # kept open for the lifetime of the process


def _acquire_lock() -> bool:
    """Try to become the one scheduler process. Returns True if lock acquired.

    Uses an OS-level exclusive flock on Linux/Android so the lock is
    automatically released if the process dies — no stale lock files.
    On Windows (local dev, always single-worker) fcntl is unavailable so
    we skip locking — ImportError is the cross-platform signal.
    """
    global _lock_fh

    try:
        import fcntl
    except ImportError:
        return True  # Windows — single worker assumed, no lock needed

    try:
        fh = open(_LOCK_FILE, "w")
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fh.write(str(os.getpid()))
        fh.flush()
        _lock_fh = fh  # hold open — OS releases lock when this process exits
        return True
    except OSError:
        return False


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

    now = datetime.now()
    ms = now.microsecond // 1000
    dest = backup_dir / f"shadow-{now.strftime('%d%m%Y-%H%M%S')}{ms:03d}.db"

    if not src.exists():
        log.error("DB backup skipped: database file not found at %s", src)
        return None

    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
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
        backup_dir.glob("shadow-*.db"),
        key=lambda p: p.stat().st_mtime,
    )
    while len(backups) > settings.db_backup_limit:
        oldest = backups.pop(0)
        oldest.unlink()
        log.info("DB backup limit reached — deleted oldest: %s", oldest.name)


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

    if not _acquire_lock():
        log.info("DB backup scheduler: another worker is already running it, skipping.")
        return

    log.info("DB backup scheduler started. Slots: %s", ", ".join(s for s, _ in runtimes))

    triggered_today: set[str] = set()
    last_date: date = datetime.now().date()

    while True:
        await asyncio.sleep(30)

        now = datetime.now()
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
