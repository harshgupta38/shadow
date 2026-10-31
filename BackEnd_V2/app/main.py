from contextlib import asynccontextmanager

import asyncio
import json
import logging
import time

from pathlib import Path
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.router import api_router
from app.api.system import router as system_router
from app.api.shortcuts import router as shortcuts_router
from app.core.config import settings
from app.core.endpoints import ENDPOINTS

from app.db.session import SessionLocal, engine
from app.models.base import Base
from app.core.exceptions import AppError, TooManyRequestsError

# These create the tables (if not present) when the server starts
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
from app.models.scheduled_task_proposal import ScheduledTaskProposalDBM
from app.models.memory import UserMemoryDBM
from app.models.report import ReportDBM
from app.models.report_email_send import ReportEmailSendDBM
from app.models.notification import NotificationDBM
from app.models.daily_brief import DailyBriefDBM
from app.models.daily_brief_audio import DailyBriefAudioDBM
from app.models.push_subscription import PushSubscriptionDBM
from app.models.user_setting import UserSettingDBM
from app.models.active_session import ActiveSessionDBM
from app.models.ip_rate_limit import IpRateLimitDBM
from app.models.daily_usage import DailyUsageDBM
from app.models.scheduled_task_subtask import ScheduledTaskSubtaskDBM
from app.models.journal import JournalEntryDBM
from app.models.workout import (
    OPEN_SESSION_INDEX,
    OPEN_SESSION_WHERE,
    WorkoutExerciseDBM,
    WorkoutPlanDayDBM,
    WorkoutPlanDBM,
    WorkoutPlanExerciseDBM,
    WorkoutSessionDBM,
    WorkoutSessionExerciseDBM,
    WorkoutSettingDBM,
)
from app.models.data_version import DataVersionDBM
from app.services import planner_service, backup_service, notification_scheduler_service, report_scheduler_service, session_event_service, workout_seed_service, workout_sessions_service
from app.api.notifications import reset_shutdown as _reset_sse_shutdown
from app.api.notifications import signal_shutdown as _signal_sse_shutdown


_startup_logger = logging.getLogger(__name__)


def _fold_session_sets_into_exercises(conn) -> None:
    """Moves each session's sets from workout_session_sets into a JSON column on its exercise row, then drops the old table.

    One transaction. BEGIN IMMEDIATE makes workers that start together take turns, so the second one finds nothing left to do.
    """
    from sqlalchemy import text as _sql_text  # pyright: ignore[reportMissingImports]

    conn.exec_driver_sql("BEGIN IMMEDIATE")
    try:
        tables = {row[0] for row in conn.execute(_sql_text("SELECT name FROM sqlite_master WHERE type = 'table'"))}
        if "workout_session_sets" in tables:
            conn.execute(_sql_text("ALTER TABLE workout_session_exercises ADD COLUMN sets JSON NOT NULL DEFAULT '[]'"))
            sets_by_entry: dict[int, list[dict]] = {}
            rows = conn.execute(
                _sql_text("SELECT session_exercise_id, reps, weight_kg, done FROM workout_session_sets ORDER BY session_exercise_id, position")
            ).fetchall()
            for entry_id, reps, weight_kg, done in rows:
                sets_by_entry.setdefault(entry_id, []).append({"reps": reps, "weight_kg": weight_kg, "done": bool(done)})
            for entry_id, sets in sets_by_entry.items():
                conn.execute(
                    _sql_text("UPDATE workout_session_exercises SET sets = :sets WHERE id = :id"),
                    {"sets": json.dumps(sets), "id": entry_id},
                )
            conn.execute(_sql_text("DROP TABLE workout_session_sets"))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def _add_column_if_missing(conn, table: str, column: str, ddl: str) -> None:
    """Runs an ADD COLUMN unless the column is already there. Workers start together, so another one may add it first."""
    from sqlalchemy import text as _sql_text  # pyright: ignore[reportMissingImports]

    existing = {row[1] for row in conn.execute(_sql_text(f"PRAGMA table_info({table})")).fetchall()}
    if column in existing:
        return
    try:
        conn.execute(_sql_text(ddl))
        conn.commit()
    except OperationalError as exc:  # another worker added the column first
        if "duplicate column name" not in str(exc):
            raise


def _backfill_plan_weekday(conn) -> None:
    """Open workouts started before plan_weekday existed take the weekday of their plan day while that day is still
    linked. Once a plan edit has unlinked the day, the weekday of the start date stands in: the app only starts the plan
    day of today's weekday, so the two agree. A workout of a deleted plan keeps NULL. Idempotent."""
    from sqlalchemy import text as _sql_text  # pyright: ignore[reportMissingImports]

    conn.execute(
        _sql_text(
            "UPDATE workout_sessions SET plan_weekday = COALESCE("
            "(SELECT workout_plan_days.weekday FROM workout_plan_days WHERE workout_plan_days.id = workout_sessions.plan_day_id), "
            "CAST(strftime('%w', workout_sessions.session_date) AS INTEGER)) "
            f"WHERE {OPEN_SESSION_WHERE} AND plan_weekday IS NULL AND plan_id IS NOT NULL"
        )
    )
    conn.commit()


def _open_workout_guard_in_place(db) -> bool:
    """True when the one-open-workout index exists and no user has two open workouts."""
    from sqlalchemy import text as _sql_text  # pyright: ignore[reportMissingImports]

    indexed = db.execute(
        _sql_text("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = :name"), {"name": OPEN_SESSION_INDEX}
    ).first()
    doubled = db.execute(
        _sql_text(f"SELECT 1 FROM workout_sessions WHERE {OPEN_SESSION_WHERE} GROUP BY user_id HAVING COUNT(*) > 1")
    ).first()
    return indexed is not None and doubled is None


def _keep_one_open_workout_per_user() -> None:
    """Allows one open workout per user, which the partial unique index then enforces. Databases created before the index
    can hold several open workouts per user: the newest is kept and the others are settled as stale workouts are
    (workout_sessions_service.settle_duplicate_open_sessions). BEGIN IMMEDIATE makes workers that start together take
    turns, so the second finds nothing left to settle. A constraint or duplicate-index error counts as success only
    when the index is in place and no user has two open workouts; anything else stops the startup."""
    from sqlalchemy import text as _sql_text  # pyright: ignore[reportMissingImports]

    with SessionLocal() as db:
        try:
            db.execute(_sql_text("BEGIN IMMEDIATE"))
            workout_sessions_service.settle_duplicate_open_sessions(db, workout_sessions_service.now_utc())
            db.execute(
                _sql_text(f"CREATE UNIQUE INDEX IF NOT EXISTS {OPEN_SESSION_INDEX} ON workout_sessions (user_id) WHERE {OPEN_SESSION_WHERE}")
            )
            db.commit()
        except (IntegrityError, OperationalError):
            db.rollback()
            if not _open_workout_guard_in_place(db):
                raise


def _migrate_workout(engine) -> None:
    """Brings a database created before the current workout schema up to date. Every step is idempotent, so workers
    that start together can all run it."""
    with engine.connect() as _conn:
        _add_column_if_missing(
            _conn, "workout_exercises", "kind",
            "ALTER TABLE workout_exercises ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'strength'",
        )
        _add_column_if_missing(
            _conn, "workout_exercises", "measure",
            "ALTER TABLE workout_exercises ADD COLUMN measure VARCHAR(12) NOT NULL DEFAULT 'reps'",
        )
        _add_column_if_missing(
            _conn, "workout_exercises", "equipment_type",
            "ALTER TABLE workout_exercises ADD COLUMN equipment_type VARCHAR(16) NOT NULL DEFAULT 'heavy_equipment'",
        )
        _add_column_if_missing(
            _conn, "workout_settings", "active_plan_started_on",
            "ALTER TABLE workout_settings ADD COLUMN active_plan_started_on DATE",
        )
        _fold_session_sets_into_exercises(_conn)
        _add_column_if_missing(
            _conn, "workout_sessions", "plan_weekday",
            "ALTER TABLE workout_sessions ADD COLUMN plan_weekday INTEGER CHECK (plan_weekday IS NULL OR plan_weekday BETWEEN 0 AND 6)",
        )
        _backfill_plan_weekday(_conn)
    _keep_one_open_workout_per_user()


def _create_schema(engine) -> None:
    """Creates missing tables, then runs the workout migration. Workers start together, and the first one to take the
    write lock creates the new tables, so a sibling can find a table already there ("already exists") or wait past
    SQLite's busy timeout. Both steps are idempotent, so the sibling retries and finds what is already in place."""
    for attempt in range(1, 6):
        try:
            Base.metadata.create_all(bind=engine)
            _migrate_workout(engine)
            return
        except OperationalError as exc:
            transient = "already exists" in str(exc) or "database is locked" in str(exc)
            if not transient or attempt == 5:
                raise
            time.sleep(2)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not settings.smtp_host or not settings.smtp_from_email:
        _startup_logger.warning(
            "SMTP is not configured (SMTP_HOST / SMTP_FROM_EMAIL missing). "
            "Email notifications are disabled until these are set in the environment."
        )
    _create_schema(engine)
    # Add columns that didn't exist when the DB was first created.
    with engine.connect() as _conn:
        _add_column_if_missing(
            _conn, "habits", "streak_tolerance_pct",
            "ALTER TABLE habits ADD COLUMN streak_tolerance_pct INTEGER NOT NULL DEFAULT 100",
        )
        _add_column_if_missing(_conn, "reports", "weekly_insights", "ALTER TABLE reports ADD COLUMN weekly_insights JSON")
    with SessionLocal() as db:
        try:
            workout_seed_service.sync_seed(db)
            workout_seed_service.normalise_plan_doses(db)
        except IntegrityError:
            db.rollback()  # another worker seeded the same rows first; its copy is the one kept
        except Exception:
            db.rollback()
            _startup_logger.exception("Workout library seed failed; the workout page will show an empty library.")
    with SessionLocal() as db:
        planner_service.sync_all_plans(db)

    session_event_service.set_event_loop(asyncio.get_running_loop())
    _reset_sse_shutdown()
    backup_sched = asyncio.create_task(backup_service.backup_scheduler_loop())
    report_sched = asyncio.create_task(report_scheduler_service.report_scheduler_loop())
    notif_sched = asyncio.create_task(notification_scheduler_service.notification_scheduler_loop())
    yield
    _signal_sse_shutdown()
    for task in (backup_sched, report_sched, notif_sched):
        task.cancel()
        try:
            await task
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
    max_age=600,
)


@app.middleware("http")
async def csrf_origin_check(request: Request, call_next: Callable) -> Response:
    """Rejects state-changing requests whose Origin header is not in the allowed list.
    GET/HEAD/OPTIONS are exempt (read-only or preflight — CORS handles those).
    Requests with no Origin header (curl, mobile, server-to-server) pass through.
    """
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin is not None and origin not in settings.cors_origins_list:
            return JSONResponse(
                status_code=403,
                content={"message": "Request origin not permitted."},
            )
    return await call_next(request)


@app.exception_handler(TooManyRequestsError)
async def handle_too_many_requests(_request: Request, exc: TooManyRequestsError) -> JSONResponse:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after is not None else {}
    return JSONResponse(status_code=429, content={"message": exc.detail}, headers=headers)


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


class CachedStaticFiles(StaticFiles):
    """Photos are served under versioned URLs (see workout_media), so the browser can keep each one for good."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


# Exercise photos and GIFs. They are served beside the API, so the frontend bundle no longer carries them.
app.mount(
    f"{settings.api_prefix}{ENDPOINTS.WORKOUT.PREFIX}/media",
    CachedStaticFiles(directory=Path(__file__).resolve().parent / "data" / "workout" / "media"),
    name="workout-media",
)


app.include_router(system_router)
app.include_router(shortcuts_router)
app.include_router(api_router, prefix=settings.api_prefix)
