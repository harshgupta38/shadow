import asyncio
import json
import sqlite3
import subprocess

from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.api.notifications import _shutdown as _sse_shutdown
from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.services import backup_service

router = APIRouter()


class SqlRequest(BaseModel):
    query: str


def require_admin(x_admin_secret: str = Header(...)) -> None:
    """Shared gate for every /admin/* route below — each one previously
    repeated this exact same check inline; putting it in one dependency
    means there's a single place to get it right instead of eight."""
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")


@router.get(ENDPOINTS.SYSTEM.ROOT, tags=["health"])
def root() -> dict:
    return {"name": settings.app_name, "version": settings.app_version, "status": "ok"}


def _get_battery() -> str:
    try:
        data = subprocess.check_output(["termux-battery-status"])
        battery = json.loads(data)

        health = battery.get("health", "Unknown").replace("_", " ").title()
        battery_percent = battery.get("percentage", "Unknown")
        charging_status = battery.get("status", "Unknown").replace("_", " ").title()
        if battery.get("plugged") == "UNPLUGGED":
            charging_status = "Not Charging"
        temperature = battery.get("temperature", "Unknown")
        power = battery.get("current", "Unknown")

        if temperature != "Unknown":
            if temperature < 35:
                temperature_status = "Excellent"
            elif 35 <= temperature <= 40:
                temperature_status = "Normal"
            elif 40 < temperature <= 43:
                temperature_status = "Warm"
            elif 43 < temperature <= 45:
                temperature_status = "Hot"
            else:
                temperature_status = "Too Hot"
            temperature = f"{temperature_status} ({temperature}°C)"

        if power != "Unknown":
            power = power // 1000
            if power <= 400:
                power_status = "Idle power"
            elif 400 < power <= 800:
                power_status = "Light server workload"
            elif 800 < power <= 1200:
                power_status = "Heavy server workload"
            else:
                power_status = "Critical server workload"
            power_status = f"{power_status} ({power} mA)"
        else:
            power_status = "Unknown"

        return (
            f"We are currently {charging_status.lower()} with {battery_percent}% battery, "
            f"and temperature is {temperature} with {health} battery health on {power_status}."
        )

    except Exception:
        return "Unknown"


@router.get(ENDPOINTS.SYSTEM.HEALTH, tags=["health"])
async def health() -> dict:
    message = "Shadow is up and running."

    battery = _get_battery()
    if battery != "Unknown":
        message = message + " " + battery

    return {"status": "ok", "message": message, "expected_workers": settings.workers}


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


@router.get(ENDPOINTS.SYSTEM.ADMIN_LOG_STREAM, tags=["admin"], dependencies=[Depends(require_admin)])
async def stream_log(request: Request):
    """Server-Sent Events tail of server.log — seeds with the last 50
    lines, then only ever reads bytes newly appended since the last
    check (never re-reads the whole file), so watching this indefinitely
    costs nothing proportional to the file's total size. Same SSE
    conventions as /notifications/stream: a capped session duration so a
    stalled client can't pin resources forever (the frontend
    reconnects), a heartbeat so a dead connection is noticed quickly, and
    the same proxy-buffering-safe response headers.
    """
    async def generator():
        if not _LOG_PATH.exists():
            yield "data: server.log not found.\n\n"
            return

        for line in _read_tail_lines(_LOG_PATH, _LOG_SEED_LINES):
            yield f"data: {line}\n\n"
        position = _LOG_PATH.stat().st_size

        elapsed_s = 0
        max_duration_s = 20 * 60
        while elapsed_s < max_duration_s:
            try:
                await asyncio.wait_for(_sse_shutdown.wait(), timeout=1)
                break  # server is shutting down
            except asyncio.TimeoutError:
                pass  # normal tick
            elapsed_s += 1
            if await request.is_disconnected():
                break

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
                    yield f"data: {line}\n\n"
            yield ": heartbeat\n\n"

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get(ENDPOINTS.SYSTEM.ADMIN_DATABASE, tags=["admin"], dependencies=[Depends(require_admin)]) # extra
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


@router.get(ENDPOINTS.SYSTEM.ADMIN_BACKUPS, tags=["admin"], dependencies=[Depends(require_admin)])
def list_backups():
    return backup_service.list_backups()


@router.post(ENDPOINTS.SYSTEM.ADMIN_BACKUPS, tags=["admin"], dependencies=[Depends(require_admin)])
def trigger_backup():
    backup_path = backup_service.create_backup()
    if backup_path is None:
        raise HTTPException(status_code=500, detail="Backup failed — check server.log.")

    return backup_service.describe_backup(backup_path)


@router.get(ENDPOINTS.SYSTEM.ADMIN_BACKUP_FILE, tags=["admin"], dependencies=[Depends(require_admin)])
def download_backup(filename: str):
    path = backup_service.get_backup_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Backup not found.")

    return FileResponse(path=path, media_type="application/x-sqlite3", filename=path.name)


@router.post(ENDPOINTS.SYSTEM.ADMIN_BACKUP_RESTORE, tags=["admin"], dependencies=[Depends(require_admin)])
def restore_backup(filename: str):
    if backup_service.get_backup_path(filename) is None:
        raise HTTPException(status_code=404, detail="Backup not found.")

    result = backup_service.restore_backup(filename)
    if result is None:
        raise HTTPException(status_code=500, detail="Restore failed — check server.log.")

    return result


@router.delete(ENDPOINTS.SYSTEM.ADMIN_BACKUP_FILE, tags=["admin"], dependencies=[Depends(require_admin)])
def delete_backup(filename: str):
    if not backup_service.delete_backup(filename):
        raise HTTPException(status_code=404, detail="Backup not found.")

    return {"deleted": filename}


@router.post(ENDPOINTS.SYSTEM.ADMIN_BACKUP_QUERY, tags=["admin"], dependencies=[Depends(require_admin)])
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


@router.post(ENDPOINTS.SYSTEM.ADMIN_SQL, tags=["admin"], dependencies=[Depends(require_admin)])
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
