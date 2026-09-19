"""Deploy/rollback orchestration.

There are no git tags in this repo — releases are just commits merged into
the tracked branch (see webhook_listener.py's hardcoded ref check). So:

  * "Deploy" = trigger the exact same webhook_listener.py flow a real GitHub
    push already triggers (git fetch/checkout/pull the tracked branch, then
    restart_server.sh). BackOffice never re-implements that chain itself —
    it POSTs the same payload a webhook would send.
  * "Rollback" = check out a specific past commit directly (webhook_listener
    only ever pulls the branch tip, it has no notion of "an older version").
    This is the one place BackOffice runs git itself. It's a temporary,
    detached-HEAD state by design: the next normal deploy moves the branch
    back to its tip and supersedes it — this is meant for emergency
    recovery, not a permanent revert.

Both triggers are fire-and-forget from the OS's point of view (webhook.py
backgrounds its shell command; restart_server.sh backgrounds the new uvicorn
process), so neither gives a synchronous success signal. Confirmation comes
from polling shadow_client.wait_for_restart() afterwards.
"""

import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.deployment_log import DeploymentLogDBM
from app.services import shadow_client


def _backend_dir() -> Path:
    return Path(settings.shadow_backend_dir).expanduser()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _current_commit_sha() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=_backend_dir(), capture_output=True, text=True, timeout=10,
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception:
        return None


def list_recent_commits(limit: int = 20) -> list[dict]:
    """Real deployment history — the tracked branch's commit log, standing
    in for the fictional version tags the UI used to show."""
    try:
        result = subprocess.run(
            ["git", "log", f"-{limit}", "--pretty=format:%H|%h|%an|%aI|%s"],
            cwd=_backend_dir(), capture_output=True, text=True, timeout=10,
        )
    except Exception:
        return []
    if result.returncode != 0:
        return []

    current = _current_commit_sha()
    commits = []
    for line in result.stdout.splitlines():
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


def create_deployment_record(db: Session, label: str, description: str, target: str, triggered_by: str) -> DeploymentLogDBM:
    log = DeploymentLogDBM(
        label=label, description=description, target=target, kind="deploy",
        git_ref=settings.shadow_git_ref, status="running", triggered_by=triggered_by,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def create_rollback_record(db: Session, commit_sha: str, description: str, triggered_by: str) -> DeploymentLogDBM:
    log = DeploymentLogDBM(
        label=f"rollback:{commit_sha[:7]}", description=description, target="Backend",
        kind="rollback", git_ref=commit_sha, status="running", triggered_by=triggered_by,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _finish(db: Session, log: DeploymentLogDBM, status: str, lines: list[str]) -> None:
    log.status = status
    log.commit_sha = _current_commit_sha()
    log.log_output = "\n".join(lines)
    log.completed_at = _utcnow()
    db.commit()


def run_deploy_job(deployment_id: int, target: str) -> None:
    """Runs as a FastAPI BackgroundTask — opens its own DB session since the
    request-scoped one is already closed by the time this executes."""
    db = SessionLocal()
    log: DeploymentLogDBM | None = None
    try:
        log = db.get(DeploymentLogDBM, deployment_id)
        if log is None:
            return

        lines = [f"$ POST {settings.shadow_webhook_url}/webhook  (ref={settings.shadow_git_ref})"]
        try:
            resp = httpx.post(
                f"{settings.shadow_webhook_url}/webhook",
                json={"ref": settings.shadow_git_ref},
                timeout=10.0,
            )
            lines.append(f"webhook_listener responded: {resp.status_code} {resp.text}")
        except httpx.RequestError as e:
            lines.append(f"ERROR: could not reach webhook_listener: {e}")
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

        backend_dir = _backend_dir()
        lines = [f"$ cd {backend_dir} && git fetch origin && git checkout {commit_sha} && ./restart_server.sh"]

        try:
            fetch = subprocess.run(
                ["git", "fetch", "origin"], cwd=backend_dir,
                capture_output=True, text=True, timeout=30,
            )
            lines.append((fetch.stdout + fetch.stderr).strip())

            checkout = subprocess.run(
                ["git", "checkout", commit_sha], cwd=backend_dir,
                capture_output=True, text=True, timeout=15,
            )
            lines.append((checkout.stdout + checkout.stderr).strip())
            if checkout.returncode != 0:
                raise RuntimeError(f"git checkout failed: {checkout.stderr.strip()}")

            lines.append(
                "NOTE: this checks out a specific commit in a detached HEAD "
                f"state. The next regular deploy (git push to "
                f"{settings.shadow_git_branch}) will move the branch back to "
                "its latest commit, so this rollback is temporary by design "
                "— it's for emergency recovery, not a permanent revert."
            )

            restart = subprocess.run(
                ["bash", "restart_server.sh"], cwd=backend_dir,
                capture_output=True, text=True, timeout=30,
            )
            lines.append((restart.stdout + restart.stderr).strip())
        except Exception as e:
            lines.append(f"ERROR: {e}")
            _finish(db, log, "failed", lines)
            return

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
