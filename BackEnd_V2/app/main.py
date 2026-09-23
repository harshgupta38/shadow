from contextlib import asynccontextmanager

import asyncio
import logging

from typing import Callable

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.exceptions import RequestValidationError

from app.api.router import api_router
from app.api.system import router as system_router
from app.api.shortcuts import router as shortcuts_router
from app.core.config import settings

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
from app.models.notification import NotificationDBM
from app.models.daily_brief import DailyBriefDBM
from app.models.daily_brief_audio import DailyBriefAudioDBM
from app.models.push_subscription import PushSubscriptionDBM
from app.models.user_setting import UserSettingDBM
from app.models.active_session import ActiveSessionDBM
from app.models.ip_rate_limit import IpRateLimitDBM
from app.services import planner_service, backup_service, notification_scheduler_service, report_scheduler_service, session_event_service
from app.api.notifications import reset_shutdown as _reset_sse_shutdown
from app.api.notifications import signal_shutdown as _signal_sse_shutdown


_startup_logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not settings.smtp_host or not settings.smtp_from_email:
        _startup_logger.warning(
            "SMTP is not configured (SMTP_HOST / SMTP_FROM_EMAIL missing). "
            "Email notifications are disabled until these are set in the environment."
        )
    Base.metadata.create_all(bind=engine)
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
    max_age=30,
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


app.include_router(system_router)
app.include_router(shortcuts_router)
app.include_router(api_router, prefix=settings.api_prefix)
