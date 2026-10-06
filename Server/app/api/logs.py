from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

from app.api.deps import RequireControlSecret
from app.core.config import settings
from app.core.endpoints import ENDPOINTS

router = APIRouter(prefix=ENDPOINTS.LOGS.PREFIX, tags=["Logs"])


# ─── Shadow V2 ───────────────────────────────────────────────────────────────

@router.get(ENDPOINTS.LOGS.MAIN, response_class=PlainTextResponse)
def get_main_log(_auth: RequireControlSecret, tail: int = 500):
    log = settings.main_path / "server.log"
    if not log.exists():
        raise HTTPException(status_code=404, detail="server.log not found.")
    lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-tail:])


@router.get(ENDPOINTS.LOGS.MAIN_DOWNLOAD)
def download_main_log(_auth: RequireControlSecret):
    log = settings.main_path / "server.log"
    if not log.exists():
        raise HTTPException(status_code=404, detail="server.log not found.")
    return FileResponse(path=log, filename="server.log", media_type="text/plain")


# ─── BackOffice ──────────────────────────────────────────────────────────────

@router.get(ENDPOINTS.LOGS.BACKOFFICE, response_class=PlainTextResponse)
def get_backoffice_log(_auth: RequireControlSecret, tail: int = 500):
    log = settings.backoffice_path / "backoffice.log"
    if not log.exists():
        raise HTTPException(status_code=404, detail="backoffice.log not found.")
    lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-tail:])


@router.get(ENDPOINTS.LOGS.BACKOFFICE_DOWNLOAD)
def download_backoffice_log(_auth: RequireControlSecret):
    log = settings.backoffice_path / "backoffice.log"
    if not log.exists():
        raise HTTPException(status_code=404, detail="backoffice.log not found.")
    return FileResponse(path=log, filename="backoffice.log", media_type="text/plain")


# ─── Control server's own log ────────────────────────────────────────────────

@router.get(ENDPOINTS.LOGS.CONTROL, response_class=PlainTextResponse)
def get_control_log(_auth: RequireControlSecret, tail: int = 200):
    log = Path("control.log")
    if not log.exists():
        raise HTTPException(status_code=404, detail="control.log not found.")
    lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(lines[-tail:])
