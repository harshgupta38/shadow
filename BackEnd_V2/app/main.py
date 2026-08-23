from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.api.router import api_router
from app.core.config import settings
from app.db.session import engine, SessionLocal
from app.models.base import Base
from app.core.exceptions import AppError

# These will be moved soon, these create the table (if not present) when server start
from app.models.user import UserDBM
from app.models.goal import GoalDBM
from app.models.goal_proposal import GoalProposalDBM
from app.models.milestone import MilestoneDBM
from app.models.milestone_proposal import MilestoneProposalDBM
from app.models.task import TaskDBM
from app.models.habit import HabitDBM
from app.models.plan_item import PlanItemDBM


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from datetime import date
    from sqlalchemy import select
    from app.services import plan_service

    Base.metadata.create_all(bind=engine)

    # Backfill plan items for all users on startup.
    # get_today_plan() is read-only — it only fetches rows already in plan_items.
    # This ensures those rows exist by running the planning engine for every user:
    #   - marks any past planned items as missed
    #   - generates planned items for the next 30 days from their active habits
    # Safe to run every startup because generate_for_habit is idempotent.
    with SessionLocal() as db:
        user_ids = db.scalars(select(UserDBM.id)).all()
        for uid in user_ids:
            plan_service.sync_all_habits(db, uid, date.today())

    yield


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


app.include_router(api_router, prefix=settings.api_prefix)
