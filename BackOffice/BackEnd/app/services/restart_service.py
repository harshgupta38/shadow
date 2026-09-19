"""Plain worker restart — runs restart_server.sh directly (no git pull),
distinct from a deploy. This is why BackOffice runs co-located with
BackEnd_V2: it needs filesystem access to that script.

Note on "restart worker N": uvicorn's --workers arbiter manages its forked
workers as one unit — there is no supported way to restart a single worker
independently without a process supervisor (gunicorn + a reload signal, or
similar) that isn't set up here. So this always restarts the whole group;
callers should treat "restart worker" and "restart server" as the same
action against this backend.
"""

import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.restart_log import RestartLogDBM
from app.services import shadow_client


def _backend_dir() -> Path:
    return Path(settings.shadow_backend_dir).expanduser()


def create_restart_record(db: Session, initiated_by: str) -> RestartLogDBM:
    log = RestartLogDBM(trigger="manual", initiated_by=initiated_by, status="running")
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def run_restart_job(restart_id: int) -> None:
    """Runs as a FastAPI BackgroundTask with its own DB session."""
    db = SessionLocal()
    log: RestartLogDBM | None = None
    started = time.monotonic()
    try:
        log = db.get(RestartLogDBM, restart_id)
        if log is None:
            return

        backend_dir = _backend_dir()
        try:
            result = subprocess.run(
                ["bash", "restart_server.sh"],
                cwd=backend_dir, capture_output=True, text=True, timeout=30,
            )
            log.log_output = (result.stdout + result.stderr).strip()
        except Exception as e:
            log.status = "failed"
            log.log_output = f"ERROR: {e}"
            log.completed_at = datetime.now(timezone.utc)
            log.duration_seconds = time.monotonic() - started
            db.commit()
            return

        healthy = shadow_client.wait_for_restart()
        log.status = "success" if healthy else "unknown"
        log.log_output += (
            "\nHealth check confirmed the server came back up."
            if healthy else
            "\nCould not confirm the server came back up within the timeout — check /server/log."
        )
        log.completed_at = datetime.now(timezone.utc)
        log.duration_seconds = time.monotonic() - started
        db.commit()
    except Exception as e:
        if log is not None:
            try:
                log.status = "failed"
                log.log_output = f"ERROR: unexpected failure — {e}"
                log.completed_at = datetime.now(timezone.utc)
                log.duration_seconds = time.monotonic() - started
                db.commit()
            except Exception:
                pass
    finally:
        db.close()
