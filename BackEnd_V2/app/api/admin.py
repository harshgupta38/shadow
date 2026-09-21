"""Every route in this file exists solely for BackOffice — Shadow's own
admin panel, a separate app that manages this one remotely — to call.
Gated by a shared X-Admin-Secret header (see require_admin below), never by
a normal user session, and never called by BackEnd_V2's own real end users
or by anything else in this codebase. Kept out of app/api/system.py, which
holds the general-purpose routes (/, /health) that the Control Server and
BackOffice both call, so the BackOffice-only surface area stays easy to
find and audit in one place instead of mixed in with shared infrastructure.

The underlying services these routes call (backup_service, the live
shadow.db/backups directory) are NOT BackOffice-specific themselves —
BackEnd_V2 also runs its own scheduled backups independently — only the
thin HTTP/WebSocket handlers here are.
"""

import asyncio
import contextlib
import logging
import sqlite3

from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.notifications import _shutdown as _shutdown_event
from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.services import backup_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix=ENDPOINTS.ADMIN.PREFIX, tags=["admin"])


class SqlRequest(BaseModel):
    query: str


def require_admin(x_admin_secret: str = Header(...)) -> None:
    """Shared gate for every route below — each one previously repeated
    this exact same check inline; putting it in one dependency means
    there's a single place to get it right instead of eight."""
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


_LOG_PATH = Path("server.log")
_LOG_SEED_LINES = 50


def _read_tail_lines(path: Path, n: int) -> list[str]:
    """Approximates `tail -n N` by reading backward in fixed-size chunks
    until at least N newlines are seen (or the start of the file) —
    reading the whole file into memory just to keep its last few lines
    is exactly the "spamming the server" cost this whole endpoint exists
    to avoid, and it only gets worse as the file grows."""
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


_LOG_WS_TICK_S = 1.0
_LOG_WS_MAX_DURATION_S = 20 * 60


@router.websocket(ENDPOINTS.ADMIN.LOG_WS)
async def log_ws(websocket: WebSocket):
    """Websocket tail of server.log — seeds with the last 50 lines, then
    only ever reads bytes newly appended since the last check (never
    re-reads the whole file), so watching this indefinitely costs
    nothing proportional to the file's total size. Header-based auth
    (not cookies): this is a server-to-server connection — BackOffice's
    own log_ws (app.api.server, BackEnd_V2's only real client) connects
    here with the same X-Admin-Secret header every other route in this
    file uses. Same capped-session convention as health_ws over on
    BackOffice's side — including reusing one long-lived receive_text()
    task across ticks (see the comment on recv_task there) rather than
    re-wrapping receive_text() in a fresh asyncio.wait_for() every tick,
    which can lose the client's one-shot disconnect notification to a
    cancellation race and delay noticing it by a full extra tick.
    """
    await websocket.accept()
    if websocket.headers.get("x-admin-secret") != settings.admin_secret:
        await websocket.close(code=4401, reason="Not authenticated")
        return

    if not _LOG_PATH.exists():
        await websocket.send_text("server.log not found.")
        await websocket.close()
        return

    recv_task = asyncio.ensure_future(websocket.receive_text())
    try:
        for line in _read_tail_lines(_LOG_PATH, _LOG_SEED_LINES):
            await websocket.send_text(line)
        position = _LOG_PATH.stat().st_size

        elapsed_s = 0.0
        while elapsed_s < _LOG_WS_MAX_DURATION_S:
            if _shutdown_event.is_set():
                break

            done, _ = await asyncio.wait({recv_task}, timeout=_LOG_WS_TICK_S)
            if recv_task in done:
                recv_task.result()  # raises WebSocketDisconnect if that's what happened
                recv_task = asyncio.ensure_future(websocket.receive_text())
            elapsed_s += _LOG_WS_TICK_S

            try:
                size = _LOG_PATH.stat().st_size
            except OSError:
                continue
            if size < position:
                position = 0  # truncated/rotated — restart_server.sh overwrites this file on every restart
            if size > position:
                with _LOG_PATH.open("r", encoding="utf-8", errors="replace") as f:
                    f.seek(position)
                    new_text = f.read()
                    position = f.tell()
                for line in new_text.splitlines():
                    await websocket.send_text(line)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("log_ws: unexpected error while streaming server.log.")
    finally:
        recv_task.cancel()
        with contextlib.suppress(Exception, asyncio.CancelledError):
            await recv_task


@router.get(ENDPOINTS.ADMIN.DATABASE, dependencies=[Depends(require_admin)])
def download_database():
    # Take a consistent snapshot via SQLite's online backup API instead of streaming
    # the live file — the server may be writing to it (WAL mode keeps recent commits
    # in a separate -wal file), so reading it directly can hand back a torn copy.
    backup_path = backup_service.create_backup()
    if backup_path is None:
        raise HTTPException(status_code=404, detail="Database file not found.")

    return FileResponse(
        path=backup_path,
        media_type="application/x-sqlite3",
        filename="shadow.db",
    )


@router.get(ENDPOINTS.ADMIN.BACKUPS, dependencies=[Depends(require_admin)])
def list_backups():
    return backup_service.list_backups()


@router.post(ENDPOINTS.ADMIN.BACKUPS, dependencies=[Depends(require_admin)])
def trigger_backup():
    backup_path = backup_service.create_backup()
    if backup_path is None:
        raise HTTPException(status_code=500, detail="Backup failed — check server.log.")

    return backup_service.describe_backup(backup_path)


@router.get(ENDPOINTS.ADMIN.BACKUP_FILE, dependencies=[Depends(require_admin)])
def download_backup(filename: str):
    path = backup_service.get_backup_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Backup not found.")

    return FileResponse(path=path, media_type="application/x-sqlite3", filename=path.name)


@router.post(ENDPOINTS.ADMIN.BACKUP_RESTORE, dependencies=[Depends(require_admin)])
def restore_backup(filename: str):
    if backup_service.get_backup_path(filename) is None:
        raise HTTPException(status_code=404, detail="Backup not found.")

    result = backup_service.restore_backup(filename)
    if result is None:
        raise HTTPException(status_code=500, detail="Restore failed — check server.log.")

    return result


@router.delete(ENDPOINTS.ADMIN.BACKUP_FILE, dependencies=[Depends(require_admin)])
def delete_backup(filename: str):
    if not backup_service.delete_backup(filename):
        raise HTTPException(status_code=404, detail="Backup not found.")

    return {"deleted": filename}


@router.post(ENDPOINTS.ADMIN.BACKUP_QUERY, dependencies=[Depends(require_admin)])
def query_backup(filename: str, body: SqlRequest):
    path = backup_service.get_backup_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Backup not found.")

    # Opened read-only at the SQLite level (mode=ro) — a write attempt fails
    # here regardless of what the query text looks like, so this is safe
    # for the admin panel's backup browser without needing to inspect or
    # restrict the SQL itself the way /admin/sql (which edits the live
    # database) has to.
    conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(body.query)
        columns = [d[0] for d in cur.description] if cur.description else []
        rows = cur.fetchall()
        return {
            "rowcount": cur.rowcount,
            "columns": columns,
            "rows": [dict(r) for r in rows],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()


@router.post(ENDPOINTS.ADMIN.SQL, dependencies=[Depends(require_admin)])
def run_sql(body: SqlRequest):
    conn = sqlite3.connect("shadow.db")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(body.query)
        conn.commit()
        rows = cur.fetchall()
        columns = [d[0] for d in cur.description] if cur.description else []
        return {
            "rowcount": cur.rowcount,
            "columns": columns,
            "rows": [dict(r) for r in rows],
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()
