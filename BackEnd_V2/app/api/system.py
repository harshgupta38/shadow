import json
import subprocess

from fastapi import APIRouter

from app.core.config import settings
from app.core.endpoints import ENDPOINTS

router = APIRouter()


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

    # expected_workers exists purely for BackOffice's Server page (compared
    # against its own psutil-counted worker processes) — harmless for this
    # endpoint's other callers (the Control Server's generic reachability
    # check) to receive and ignore.
    return {"status": "ok", "message": message, "expected_workers": settings.workers}
