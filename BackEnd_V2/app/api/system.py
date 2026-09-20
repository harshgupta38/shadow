import json
import sqlite3
import subprocess

from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.services import backup_service

router = APIRouter()


class SqlRequest(BaseModel):
    query: str


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

    return {"status": "ok", "message": message}


@router.get(ENDPOINTS.SYSTEM.SERVER_LOG, tags=["admin"], response_class=PlainTextResponse)
async def get_server_log():
    log_file = Path("server.log")

    if not log_file.exists():
        raise HTTPException(status_code=404, detail="server.log not found.")

    return log_file.read_text(encoding="utf-8")


@router.get(ENDPOINTS.SYSTEM.ADMIN_DATABASE, tags=["admin"]) # extra
def download_database(x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

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


@router.get(ENDPOINTS.SYSTEM.ADMIN_BACKUPS, tags=["admin"])
def list_backups(x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")
    return backup_service.list_backups()


@router.post(ENDPOINTS.SYSTEM.ADMIN_BACKUPS, tags=["admin"])
def trigger_backup(x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    backup_path = backup_service.create_backup()
    if backup_path is None:
        raise HTTPException(status_code=500, detail="Backup failed — check server.log.")

    return backup_service.describe_backup(backup_path)


@router.get(ENDPOINTS.SYSTEM.ADMIN_BACKUP_FILE, tags=["admin"])
def download_backup(filename: str, x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    path = backup_service.get_backup_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Backup not found.")

    return FileResponse(path=path, media_type="application/x-sqlite3", filename=path.name)


@router.post(ENDPOINTS.SYSTEM.ADMIN_BACKUP_RESTORE, tags=["admin"])
def restore_backup(filename: str, x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    if backup_service.get_backup_path(filename) is None:
        raise HTTPException(status_code=404, detail="Backup not found.")

    result = backup_service.restore_backup(filename)
    if result is None:
        raise HTTPException(status_code=500, detail="Restore failed — check server.log.")

    return result


@router.delete(ENDPOINTS.SYSTEM.ADMIN_BACKUP_FILE, tags=["admin"])
def delete_backup(filename: str, x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

    if not backup_service.delete_backup(filename):
        raise HTTPException(status_code=404, detail="Backup not found.")

    return {"deleted": filename}


@router.post(ENDPOINTS.SYSTEM.ADMIN_BACKUP_QUERY, tags=["admin"])
def query_backup(filename: str, body: SqlRequest, x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

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


@router.post(ENDPOINTS.SYSTEM.ADMIN_SQL, tags=["admin"])
def run_sql(body: SqlRequest, x_admin_secret: str = Header(...)):
    if x_admin_secret != settings.admin_secret:
        raise HTTPException(status_code=403, detail="Forbidden.")

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
