from contextlib import asynccontextmanager
from datetime import datetime, timezone
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
from app.db.session import SessionLocal, engine
from app.models.base import Base
from app.services import model_constraints

# Imported so Base.metadata.create_all sees every table on startup.
from app.models.admin_user import AdminUserDBM
from app.models.deployment_log import DeploymentLogDBM
from app.models.restart_log import RestartLogDBM
from app.models.sql_audit_log import SqlAuditLogDBM


def _reconcile_interrupted_jobs() -> None:
    """A deploy/restart's status only ever reaches "success"/"failed" if the
    background task that started it lives long enough to write it — and
    BackEnd_V2's restart_server.sh can (see its own comments, and
    restart_backoffice.sh) kill this very process mid-job as collateral
    damage. Without this, such a row is stuck at "running" forever and the
    frontend polls it indefinitely. On every startup, anything still
    "running" is honestly relabeled "unknown" — we truly don't know whether
    it finished, only that nothing here saw it happen.
    """
    with SessionLocal() as db:
        now = datetime.now(timezone.utc)
        for model in (DeploymentLogDBM, RestartLogDBM):
            db.query(model).filter(model.status == "running").update(
                {
                    "status": "unknown",
                    "completed_at": now,
                    "log_output": model.log_output + "\n[backoffice] Interrupted by a BackOffice restart before this finished.",
                },
                synchronize_session=False,
            )
        db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # BackOffice's own database — separate file from Shadow V2's shadow.db.
    Base.metadata.create_all(bind=engine)
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
