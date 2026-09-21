from fastapi import APIRouter, BackgroundTasks

from app.api.deps import CurrentAdmin, DbSession
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import NotFoundError
from app.models.deployment_log import DeploymentLogDBM
from app.schemas.deploy import CommitInfo, DeploymentResponse, NewDeploymentRequest, RollbackRequest
from app.services import deploy_service

router = APIRouter(prefix=ENDPOINTS.DEPLOY.PREFIX, tags=["Deploy"])


@router.get(ENDPOINTS.DEPLOY.HISTORY, response_model=list[DeploymentResponse])
def get_history(db: DbSession, _admin: CurrentAdmin, page: int = 1, page_size: int = 10):
    offset = max(page - 1, 0) * page_size
    return (
        db.query(DeploymentLogDBM)
        .order_by(DeploymentLogDBM.started_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )


@router.get(ENDPOINTS.DEPLOY.COMMITS, response_model=list[CommitInfo])
def get_commits(_admin: CurrentAdmin, limit: int = 20):
    return deploy_service.list_recent_commits(limit)


@router.get(ENDPOINTS.DEPLOY.DETAIL, response_model=DeploymentResponse)
def get_deployment(deployment_id: int, db: DbSession, _admin: CurrentAdmin):
    log = db.get(DeploymentLogDBM, deployment_id)
    if log is None:
        raise NotFoundError("Deployment not found.")
    return log


@router.post(ENDPOINTS.DEPLOY.NEW, response_model=DeploymentResponse)
def new_deployment(
    body: NewDeploymentRequest,
    background_tasks: BackgroundTasks,
    db: DbSession,
    admin: CurrentAdmin,
):
    git_ref = body.git_ref.strip()
    label = body.label.strip() or git_ref
    log = deploy_service.create_deployment_record(db, git_ref, label, body.description, body.target, admin.email)
    background_tasks.add_task(deploy_service.run_deploy_job, log.id, git_ref, body.target)
    return log


@router.post(ENDPOINTS.DEPLOY.ROLLBACK, response_model=DeploymentResponse)
def rollback(
    body: RollbackRequest,
    background_tasks: BackgroundTasks,
    db: DbSession,
    admin: CurrentAdmin,
):
    log = deploy_service.create_rollback_record(db, body.commit_sha, body.description, admin.email)
    background_tasks.add_task(deploy_service.run_rollback_job, log.id, body.commit_sha)
    return log
