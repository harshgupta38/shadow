"""FastAPI application entrypoint — app, middleware, routers, lifecycle."""

from __future__ import annotations

import logging
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


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


app.include_router(api_router, prefix=settings.api_prefix)
