"""Shared git + restart logic used by the /control endpoints.

Every branch name or commit SHA this module touches comes from the caller's
own request (Postman, or BackOffice acting on an admin's behalf) — nothing
is fixed in local config. If a deploy call omits the branch, it pulls
whatever branch is currently checked out instead of assuming one.
"""

import re
import subprocess
from pathlib import Path

_REF_RE = re.compile(r"^[A-Za-z0-9._/-]+$")


def validate_ref(ref: str) -> str:
    """A branch name or commit SHA — anything else (shell metacharacters,
    spaces, flags) is rejected before it reaches a subprocess argv."""
    if not _REF_RE.fullmatch(ref):
        raise ValueError(f"Invalid git ref: {ref!r}")
    return ref


def current_branch(cwd: Path) -> str | None:
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=cwd, capture_output=True, text=True, timeout=10,
    )
    branch = result.stdout.strip()
    if result.returncode != 0 or not branch or branch == "HEAD":
        return None
    return branch


def _run(cwd: Path, args: list[str], timeout: int) -> tuple[int, str]:
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    return result.returncode, (result.stdout + result.stderr).strip()


def restart(cwd: Path, restart_script: str, timeout: int = 30) -> dict:
    code, text = _run(cwd, ["bash", restart_script], timeout)
    return {"returncode": code, "output": text}


def deploy(cwd: Path, restart_script: str, branch: str | None, timeout: int = 60) -> dict:
    """git fetch + checkout <branch> + pull origin <branch> + restart.
    If branch is None, deploys whatever branch is currently checked out.
    """
    output: list[str] = []

    if branch is not None:
        branch = validate_ref(branch)
    else:
        branch = current_branch(cwd)
        if branch is None:
            return {
                "returncode": 1,
                "output": "Could not determine the current branch (detached HEAD?) — pass 'branch' explicitly.",
            }

    for args in (["git", "fetch", "origin"], ["git", "checkout", branch], ["git", "pull", "origin", branch]):
        code, text = _run(cwd, args, timeout)
        output.append(f"$ {' '.join(args)}\n{text}")
        if code != 0:
            return {"returncode": code, "output": "\n".join(output), "branch": branch}

    code, text = _run(cwd, ["bash", restart_script], timeout)
    output.append(f"$ bash {restart_script}\n{text}")
    return {"returncode": code, "output": "\n".join(output), "branch": branch}


def rollback(cwd: Path, restart_script: str, commit_sha: str, timeout: int = 60) -> dict:
    """git fetch + checkout <sha> (detached HEAD) + restart — no pull, a SHA
    isn't a branch tip. Temporary by design: the next deploy() call moves the
    branch back to its tip and supersedes this.
    """
    commit_sha = validate_ref(commit_sha)
    output: list[str] = []

    for args in (["git", "fetch", "origin"], ["git", "checkout", commit_sha]):
        code, text = _run(cwd, args, timeout)
        output.append(f"$ {' '.join(args)}\n{text}")
        if code != 0:
            return {"returncode": code, "output": "\n".join(output)}

    code, text = _run(cwd, ["bash", restart_script], timeout)
    output.append(f"$ bash {restart_script}\n{text}")
    return {"returncode": code, "output": "\n".join(output)}
