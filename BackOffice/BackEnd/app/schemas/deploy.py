from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NewDeploymentRequest(BaseModel):
    label: str
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
