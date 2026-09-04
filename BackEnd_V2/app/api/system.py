import json
import sqlite3
import subprocess

from pathlib import Path

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.endpoints import ENDPOINTS

router = APIRouter()

_ADMIN_SECRET = "admin@harsh_gupta-18042026-983652"


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


@router.post(ENDPOINTS.SYSTEM.ADMIN_SQL, tags=["admin"])
def run_sql(body: SqlRequest, x_admin_secret: str = Header(...)):
    if x_admin_secret != _ADMIN_SECRET:
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
