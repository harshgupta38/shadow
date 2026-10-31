from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.api.router import api_router
from app.api.system import router as system_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.db.session import drop_column_if_present, engine, ensure_model_columns
from app.models.base import Base
from app.services import model_constraints

# Imported so Base.metadata.create_all sees every table on startup.
from app.models.admin_user import AdminUserDBM
from app.models.deployment_log import DeploymentLogDBM
from app.models.restart_log import RestartLogDBM
from app.models.sql_audit_log import SqlAuditLogDBM
from app.models.sql_history import SqlHistoryDBM
from app.services import deploy_service, restart_service


def _reconcile_interrupted_jobs() -> None:
    """A deploy/restart's outcome only reaches the database if the background task that started it lives long enough
    to write it. Restarting BackOffice (or BackEnd_V2's restart_server.sh, which can kill this process too) ends that
    task mid-job, which would leave the row "running" forever. On every startup, the jobs still "running" are settled
    from evidence instead (see services/deploy_service.py and services/restart_service.py)."""
    deploy_service.settle_interrupted_deployments()
    restart_service.settle_interrupted_restarts()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # BackOffice's own database — separate file from Shadow V2's shadow.db.
    Base.metadata.create_all(bind=engine)
    # create_all never alters a table that already exists, so columns added to a model are added here.
    for model in (DeploymentLogDBM, RestartLogDBM):
        ensure_model_columns(model.__table__)
    # deployment_logs.target was retired. Databases created before that still have it as NOT NULL,
    # which rejects every new deployment row, so it is dropped before anything writes.
    drop_column_if_present("deployment_logs", "target")
    _reconcile_interrupted_jobs()
    # Re-read (never import/copy) BackEnd_V2's own model files so row edits
    # can be checked against its real constraints — see model_constraints.py.
    model_constraints.load_registry(Path(settings.shadow_backend_dir).expanduser() / "app" / "models")
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)


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
    """Rejects state-changing requests whose Origin header is not in the
    allowed list. GET/HEAD/OPTIONS are exempt; requests with no Origin header
    (curl, server-to-server) pass through — same policy as BackEnd_V2."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin is not None and origin not in settings.cors_origins_list:
            return JSONResponse(status_code=403, content={"message": "Request origin not permitted."})
    return await call_next(request)


@app.exception_handler(AppError)
async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
    payload: dict[str, object] = {"message": exc.detail}
    errors = getattr(exc, "errors", None)
    if isinstance(errors, dict) and errors:
        payload["errors"] = errors
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors: dict[str, str] = {}
    for error in exc.errors():
        field = str(error["loc"][-1])
        message = error["msg"]
        if message.startswith("Value error, "):
            message = message.removeprefix("Value error, ")
        errors[field] = message
    return JSONResponse(
        status_code=400,
        content={"message": "Please correct the highlighted fields.", "errors": errors},
    )


app.include_router(system_router)
app.include_router(api_router, prefix=settings.api_prefix)
