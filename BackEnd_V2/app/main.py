from contextlib import asynccontextmanager

import asyncio
import json
import subprocess

from fastapi import FastAPI, Header, HTTPException, Request # header and http exception is extra
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel # extra

from app.api.router import api_router
from app.core.config import settings

from app.db.session import SessionLocal, engine
from app.models.base import Base
from app.core.exceptions import AppError

from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import PlainTextResponse

# These will be moved soon, these create the table (if not present) when server start
from app.models.user import UserDBM
from app.models.goal import GoalDBM
from app.models.goal_proposal import GoalProposalDBM
from app.models.milestone import MilestoneDBM
from app.models.milestone_proposal import MilestoneProposalDBM
from app.models.task import TaskDBM
from app.models.habit import HabitDBM
from app.models.plan import PlanDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.yearly_task import YearlyTaskDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.services import planner_service, backup_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        planner_service.sync_all_plans(db)

    scheduler = asyncio.create_task(backup_service.backup_scheduler_loop())
    yield
    scheduler.cancel()
    try:
        await scheduler
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
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
    payload: dict[str, object] = {"message": exc.detail}

    errors = getattr(exc, "errors", None)
    if isinstance(errors, dict) and errors:
        payload["errors"] = errors

    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    errors: dict[str, str] = {}

    for error in exc.errors():
        field = str(error["loc"][-1])
        message = error["msg"]

        if message.startswith("Value error, "):
            message = message.removeprefix("Value error, ")

        errors[field] = message

    return JSONResponse(
        status_code=400,
        content={
            "message": "Please correct the highlighted fields.",
            "errors": errors,
        },
    )


@app.get("/", tags=["health"])
def root() -> dict:
    return {"name": settings.app_name, "version": settings.app_version, "status": "ok"}


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


@app.get(
    "/server/log",
    tags=["admin"],
    response_class=PlainTextResponse,
)
async def get_server_log():
    log_file = Path("server.log")

    if not log_file.exists():
        raise HTTPException(
            status_code=404,
            detail="server.log not found.",
        )

    return log_file.read_text(encoding="utf-8")


_ADMIN_SECRET = "shadow-admin-2026" # extra


class SqlRequest(BaseModel): # extra
    query: str


@app.post("/admin/sql", tags=["admin"]) # extra
def run_sql(body: SqlRequest, x_admin_secret: str = Header(...)):
    if x_admin_secret != _ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden.")

    import sqlite3
    db_path = "shadow.db"
    conn = sqlite3.connect(db_path)
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


app.include_router(api_router, prefix=settings.api_prefix)
