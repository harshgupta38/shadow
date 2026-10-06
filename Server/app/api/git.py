"""Whitelisted git commands for both managed services.

Only a fixed set of read-safe and pull-safe subcommands are allowed so this
endpoint cannot be used as a generic shell executor.
"""

import subprocess
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.api.deps import RequireControlSecret
from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.schemas.git import GitRequest

router = APIRouter(prefix=ENDPOINTS.GIT.PREFIX, tags=["Git"])

_ALLOWED = {"pull", "fetch", "status", "log", "diff", "branch", "show", "rev-parse"}


def _run_git(cwd: Path, args: list[str]) -> dict:
    if not args:
        raise HTTPException(status_code=400, detail="No git arguments provided.")
    subcmd = args[0]
    if subcmd not in _ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"'{subcmd}' is not allowed. Allowed: {sorted(_ALLOWED)}",
        )
    result = subprocess.run(
        ["git"] + args, cwd=cwd, capture_output=True, text=True, timeout=60,
    )
    return {
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
    }


@router.post(ENDPOINTS.GIT.MAIN)
def git_main(_auth: RequireControlSecret, body: GitRequest) -> dict:
    return _run_git(settings.main_path, body.args)


@router.post(ENDPOINTS.GIT.BACKOFFICE)
def git_backoffice(_auth: RequireControlSecret, body: GitRequest) -> dict:
    return _run_git(settings.backoffice_path, body.args)
