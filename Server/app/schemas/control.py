from pydantic import BaseModel


class DeployRequest(BaseModel):
    # Branch to check out + pull. Omit to deploy whatever branch is
    # currently checked out — the caller decides, nothing is fixed here.
    branch: str | None = None


class RollbackRequest(BaseModel):
    commit_sha: str
