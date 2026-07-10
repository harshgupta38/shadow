"""FastAPI application entrypoint — app, middleware, routers, lifecycle."""

from __future__ import annotations

import json
import logging
import re
import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.constant import APP_DESCRIPTION, APP_NAME, VERSION, settings
from app.database import engine
from app.models import Base  # noqa: F401 — ensures all models are registered
from app.scheduler import shutdown_scheduler, start_scheduler
from app.services.exceptions import AppError

logging.basicConfig(level=logging.INFO)
# Keep scheduler internals quiet in dev/prod logs while preserving warnings/errors.
logging.getLogger("apscheduler").setLevel(logging.WARNING)
logging.getLogger("apscheduler.scheduler").setLevel(logging.WARNING)
logging.getLogger("apscheduler.executors").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # For the SQLite MVP we create tables on startup; production migrations
    # are managed with Alembic (`alembic upgrade head`).
    Base.metadata.create_all(bind=engine)
    if settings.enable_scheduler:
        start_scheduler()
    try:
        yield
    finally:
        if settings.enable_scheduler:
            shutdown_scheduler()


app = FastAPI(
    title=APP_NAME,
    description=APP_DESCRIPTION,
    version=VERSION,
    lifespan=lifespan,
)

# CORS — locked to the configured FrontEnd origin(s).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
    """Map framework-agnostic service errors to safe HTTP responses."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.get("/", tags=["health"])
def root() -> dict:
    return {"name": APP_NAME, "version": VERSION, "status": "ok"}


def get_battery():
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

    except Exception as e:
        return "Unknown"


@app.get("/health", tags=["health"])
async def health() -> dict:

    message = "Shadow is up and running."
    
    battery = get_battery()
    if battery != "Unknown":
        message = message + " " + battery

    return {
        "status": "ok",
        "message": message,
    }


app.include_router(api_router, prefix=settings.api_prefix)
