"""Manual start / restart / deploy / rollback for both managed services.

There is no auto-trigger here — no GitHub/Bitbucket webhook, nothing fires
on its own. Every action is initiated deliberately, either by a developer
calling these endpoints directly (Postman) or by the BackOffice site calling
them on an admin's behalf.
"""

from fastapi import APIRouter, HTTPException

from app.api.deps import RequireControlSecret
from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.schemas.control import DeployRequest, RollbackRequest
from app.services import deploy_service

router = APIRouter(prefix=ENDPOINTS.CONTROL.PREFIX, tags=["Control"])


# ─── Shadow V2 ───────────────────────────────────────────────────────────────

@router.post(ENDPOINTS.CONTROL.MAIN_RESTART)
def restart_main(_auth: RequireControlSecret) -> dict:
    return deploy_service.restart(settings.main_path, "restart_server.sh")


@router.post(ENDPOINTS.CONTROL.MAIN_DEPLOY)
def deploy_main(_auth: RequireControlSecret, body: DeployRequest | None = None) -> dict:
    try:
        return deploy_service.deploy(settings.main_path, "restart_server.sh", body.branch if body else None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post(ENDPOINTS.CONTROL.MAIN_ROLLBACK)
def rollback_main(_auth: RequireControlSecret, body: RollbackRequest) -> dict:
    try:
        return deploy_service.rollback(settings.main_path, "restart_server.sh", body.commit_sha)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ─── BackOffice ──────────────────────────────────────────────────────────────

@router.post(ENDPOINTS.CONTROL.BACKOFFICE_RESTART)
def restart_backoffice(_auth: RequireControlSecret) -> dict:
    return deploy_service.restart(settings.backoffice_path, "restart_backoffice.sh")


@router.post(ENDPOINTS.CONTROL.BACKOFFICE_DEPLOY)
def deploy_backoffice(_auth: RequireControlSecret, body: DeployRequest | None = None) -> dict:
    try:
        return deploy_service.deploy(settings.backoffice_path, "restart_backoffice.sh", body.branch if body else None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
