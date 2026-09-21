from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NewDeploymentRequest(BaseModel):
    # Branch name, tag, or commit SHA to deploy — required, resolved
    # against origin by deploy_service to decide whether it's a moving
    # ref (pull) or a fixed one (checkout only). See _is_branch_ref.
    git_ref: str
    # Blank defaults to git_ref itself — see new_deployment() in api/deploy.py.
    label: str = ""
    description: str = ""
    target: str = "Backend"  # Frontend | Backend | Both — informational; see deploy_service


class RollbackRequest(BaseModel):
    commit_sha: str
    description: str = ""


class DeploymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    description: str
    target: str
    kind: str
    git_ref: str
    commit_sha: str | None
    status: str
    log_output: str
    triggered_by: str
    started_at: datetime
    completed_at: datetime | None


class CommitInfo(BaseModel):
    sha: str
    short_sha: str
    author: str
    date: str
    message: str
    is_current: bool


class BranchesResponse(BaseModel):
    branches: list[str]
    # None when HEAD is detached (right after a rollback, or after
    # deploying a tag/commit SHA) — there simply isn't a current branch.
    current: str | None
