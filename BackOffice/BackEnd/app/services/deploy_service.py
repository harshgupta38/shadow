"""Deploy/rollback orchestration.

There are no git tags in this repo — releases are just commits merged into
the tracked branch. Every git/restart action is delegated to the Control
Server (Server/, port 9000) over HTTP — BackOffice holds no direct
filesystem or subprocess access to BackEnd_V2's repo, it only calls:

  * "Deploy" = POST /control/main/deploy on the Control Server, which runs
    git fetch/checkout/pull (whatever branch is currently checked out,
    unless a branch is explicitly given) then restart_server.sh.
  * "Rollback" = POST /control/main/rollback with a commit SHA — checks out
    that commit directly (detached HEAD). This is temporary by design: the
    next normal deploy moves the branch back to its tip — it's for
    emergency recovery, not a permanent revert.
  * Commit history / "current commit" = POST /git/main with a whitelisted
    `git log` / `git rev-parse` call — same Control Server, read-only.

All of these are synchronous HTTP calls (the Control Server itself runs the
subprocess and returns the exit code + output), so unlike the old webhook
flow there IS a direct success/failure signal — the extra health-poll below
is just an additional sanity check that the process actually came back up.
"""

import json
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.deployment_log import DeploymentLogDBM
from app.services import shadow_client

_client = httpx.Client(timeout=90.0)


def _headers() -> dict:
    return {"X-Control-Secret": settings.control_secret}


def _control_post(path: str, json: dict | None = None) -> httpx.Response:
    return _client.post(f"{settings.control_server_url}{path}", json=json, headers=_headers())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _current_commit_sha() -> str | None:
    try:
        resp = _control_post("/git/main", {"args": ["rev-parse", "HEAD"]})
    except httpx.RequestError:
        return None
    if resp.status_code != 200:
        return None
    sha = resp.json().get("stdout", "").strip()
    return sha or None


def list_branches() -> list[str]:
    """Every branch that exists on origin, fetched fresh so one pushed
    moments ago shows up immediately. `git branch -r --format=...` also
    lists the origin/HEAD symbolic ref, but it renders as the bare word
    "origin" (no slash) with this format string rather than "origin/HEAD"
    — filtering on the "origin/" prefix excludes it correctly either way.
    """
    try:
        _control_post("/git/main", {"args": ["fetch", "origin"]})
        resp = _control_post("/git/main", {"args": ["branch", "-r", "--format=%(refname:short)"]})
    except httpx.RequestError:
        return []
    if resp.status_code != 200:
        return []

    names = []
    for line in resp.json().get("stdout", "").splitlines():
        line = line.strip()
        if line.startswith("origin/"):
            names.append(line[len("origin/"):])
    return names


def list_recent_commits(limit: int = 10, branch: str | None = None) -> list[dict]:
    """A branch's commit log — the tracked branch's by default, standing in
    for the fictional version tags the UI used to show. `branch` names any
    branch on origin, not just the checked-out one; fetched fresh first so
    switching to a just-pushed branch doesn't show stale history."""
    ref = f"origin/{branch}" if branch else "HEAD"
    try:
        if branch:
            _control_post("/git/main", {"args": ["fetch", "origin"]})
        resp = _control_post("/git/main", {"args": ["log", ref, f"-{limit}", "--pretty=format:%H|%h|%an|%aI|%s"]})
    except httpx.RequestError:
        return []
    if resp.status_code != 200:
        return []

    current = _current_commit_sha()
    commits = []
    for line in resp.json().get("stdout", "").splitlines():
        parts = line.split("|", 4)
        if len(parts) != 5:
            continue
        sha, short_sha, author, date, message = parts
        commits.append({
            "sha": sha,
            "short_sha": short_sha,
            "author": author,
            "date": date,
            "message": message,
            "is_current": sha == current,
        })
    return commits


def create_deployment_record(
    db: Session, git_ref: str, label: str, description: str, target: str, triggered_by: str,
) -> DeploymentLogDBM:
    log = DeploymentLogDBM(
        label=label, description=description, target=target, kind="deploy",
        git_ref=git_ref, status="running", triggered_by=triggered_by,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _is_branch_ref(ref: str) -> bool:
    """True if `ref` names a real branch on origin — checked fresh (fetch
    first) since a branch just pushed moments ago wouldn't be in this
    clone's remote-tracking refs yet. False for anything else (a tag, a
    commit SHA, or a typo); the caller then treats it as a fixed ref to
    check out directly instead of a moving one to pull, which is exactly
    what a tag or SHA needs anyway."""
    try:
        _control_post("/git/main", {"args": ["fetch", "origin"]})
        resp = _control_post("/git/main", {"args": ["rev-parse", "--verify", "--quiet", f"refs/remotes/origin/{ref}"]})
    except httpx.RequestError:
        return False
    if resp.status_code != 200:
        return False
    data = resp.json()
    return data.get("returncode") == 0 and bool(data.get("stdout", "").strip())


def create_rollback_record(db: Session, commit_sha: str, description: str, triggered_by: str) -> DeploymentLogDBM:
    log = DeploymentLogDBM(
        label=f"rollback:{commit_sha[:7]}", description=description, target="Backend",
        kind="rollback", git_ref=commit_sha, status="running", triggered_by=triggered_by,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _append_control_response(lines: list[str], resp: httpx.Response) -> None:
    """Unwraps the Control Server's {"returncode", "output"} JSON body into
    the git/restart transcript it actually contains. Appending resp.text
    directly (the old behavior) showed the raw JSON, with the transcript's
    own newlines escaped as literal backslash-n instead of real line
    breaks — readable as JSON, not as the terminal output it's supposed to
    look like. On a non-2xx response there's no "output" key at all (just
    FastAPI's own {"detail": ...}), which is handled the same way."""
    lines.append(f"control server responded: {resp.status_code}")
    try:
        data = resp.json()
    except ValueError:
        lines.append(resp.text)
        return

    if isinstance(data, dict) and "output" in data:
        lines.append(data["output"])
        if "returncode" in data:
            lines.append(f"(exit code {data['returncode']})")
    elif isinstance(data, dict) and "detail" in data:
        lines.append(str(data["detail"]))
    else:
        lines.append(json.dumps(data, indent=2))


def _finish(db: Session, log: DeploymentLogDBM, status: str, lines: list[str]) -> None:
    log.status = status
    log.commit_sha = _current_commit_sha()
    log.log_output = "\n".join(lines)
    log.completed_at = _utcnow()
    db.commit()


def run_deploy_job(deployment_id: int, git_ref: str, target: str) -> None:
    """Runs as a FastAPI BackgroundTask — opens its own DB session since the
    request-scoped one is already closed by the time this executes.

    `git_ref` can be a branch, a tag, or a commit SHA — resolved here (not
    by the caller) since deciding which control-server call to make needs
    a fresh fetch either way. A branch is a moving ref, so it goes through
    /control/main/deploy (checkout + pull); a tag or SHA is fixed, so it
    goes through /control/main/rollback (checkout only, detached HEAD) —
    same mechanics rollback already uses, just recorded here as kind
    "deploy" since that's what the admin actually asked for.
    """
    db = SessionLocal()
    log: DeploymentLogDBM | None = None
    try:
        log = db.get(DeploymentLogDBM, deployment_id)
        if log is None:
            return

        if _is_branch_ref(git_ref):
            lines = [f"$ POST {settings.control_server_url}/control/main/deploy  (branch={git_ref})"]
            endpoint, body = "/control/main/deploy", {"branch": git_ref}
        else:
            lines = [
                f"$ POST {settings.control_server_url}/control/main/rollback  (commit_sha={git_ref})",
                f"'{git_ref}' did not resolve to a branch on origin — checking it out directly "
                "(detached HEAD), the same way a tag or a specific commit SHA is deployed.",
            ]
            endpoint, body = "/control/main/rollback", {"commit_sha": git_ref}

        try:
            resp = _control_post(endpoint, body)
        except httpx.RequestError as e:
            lines.append(f"ERROR: could not reach control server: {e}")
            _finish(db, log, "failed", lines)
            return
        _append_control_response(lines, resp)

        if resp.status_code >= 400:
            _finish(db, log, "failed", lines)
            return

        if target != "Backend":
            lines.append(
                "NOTE: only the backend is redeployed by this action — frontend "
                "changes are not automated here (Firebase Hosting is a separate "
                "pipeline) and must be deployed independently."
            )

        healthy = shadow_client.wait_for_restart()
        lines.append(
            "Health check confirmed the server came back up."
            if healthy else
            "Could not confirm the server came back up within the timeout — check /server/log."
        )
        _finish(db, log, "success" if healthy else "unknown", lines)
    except Exception as e:
        if log is not None:
            try:
                _finish(db, log, "failed", [f"ERROR: unexpected failure — {e}"])
            except Exception:
                pass
    finally:
        db.close()


def run_rollback_job(deployment_id: int, commit_sha: str) -> None:
    db = SessionLocal()
    log: DeploymentLogDBM | None = None
    try:
        log = db.get(DeploymentLogDBM, deployment_id)
        if log is None:
            return

        lines = [f"$ POST {settings.control_server_url}/control/main/rollback  (commit_sha={commit_sha})"]
        try:
            resp = _control_post("/control/main/rollback", {"commit_sha": commit_sha})
        except httpx.RequestError as e:
            lines.append(f"ERROR: could not reach control server: {e}")
            _finish(db, log, "failed", lines)
            return
        _append_control_response(lines, resp)

        if resp.status_code >= 400:
            _finish(db, log, "failed", lines)
            return

        lines.append(
            "NOTE: this checks out a specific commit in a detached HEAD "
            "state. The next regular deploy will move the branch back to "
            "its latest commit, so this rollback is temporary by design "
            "— it's for emergency recovery, not a permanent revert."
        )

        healthy = shadow_client.wait_for_restart()
        lines.append(
            "Health check confirmed the server came back up."
            if healthy else
            "Could not confirm the server came back up within the timeout — check /server/log."
        )
        _finish(db, log, "success" if healthy else "unknown", lines)
    except Exception as e:
        if log is not None:
            try:
                _finish(db, log, "failed", [f"ERROR: unexpected failure — {e}"])
            except Exception:
                pass
    finally:
        db.close()
