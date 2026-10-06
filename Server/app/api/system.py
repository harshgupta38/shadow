import httpx
from fastapi import APIRouter

from app.core.config import settings
from app.core.endpoints import ENDPOINTS

router = APIRouter()


def _probe(port: int) -> dict:
    try:
        resp = httpx.get(f"http://127.0.0.1:{port}/health", timeout=5.0)
        if resp.status_code == 200:
            return {"status": "ok"}
        return {"status": "degraded", "code": resp.status_code}
    except httpx.RequestError:
        return {"status": "down"}


@router.get(ENDPOINTS.SYSTEM.ROOT, tags=["health"])
def root() -> dict:
    return {"name": settings.app_name, "version": settings.app_version, "status": "ok"}


@router.get(ENDPOINTS.SYSTEM.HEALTH, tags=["health"])
def health() -> dict:
    return {"status": "ok"}


@router.get(ENDPOINTS.SYSTEM.HEALTH_MAIN, tags=["health"])
def health_main() -> dict:
    return _probe(settings.main_port)


@router.get(ENDPOINTS.SYSTEM.HEALTH_BACKOFFICE, tags=["health"])
def health_backoffice() -> dict:
    return _probe(settings.backoffice_port)


@router.get(ENDPOINTS.SYSTEM.HEALTH_ALL, tags=["health"])
def health_all() -> dict:
    return {
        "control": {"status": "ok"},
        "main": _probe(settings.main_port),
        "backoffice": _probe(settings.backoffice_port),
    }
