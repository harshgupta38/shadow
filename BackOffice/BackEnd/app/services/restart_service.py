"""Plain worker restart — delegates to the Control Server's
POST /control/main/restart (no git pull), distinct from a deploy.

Note on "restart worker N": uvicorn's --workers arbiter manages its forked
workers as one unit — there is no supported way to restart a single worker
independently without a process supervisor (gunicorn + a reload signal, or
similar) that isn't set up here. So this always restarts the whole group;
callers should treat "restart worker" and "restart server" as the same
action against this backend.
"""

import json
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.restart_log import RestartLogDBM
from app.services import shadow_client

_client = httpx.Client(timeout=60.0)


def _control_response_text(resp: httpx.Response) -> str:
    """Unwraps the Control Server's {"returncode", "output"} JSON body into
    the restart transcript it actually contains, the same way
    deploy_service._append_control_response does — resp.text alone shows
    the raw JSON with the transcript's own newlines escaped as literal
    backslash-n instead of real line breaks."""
    try:
        data = resp.json()
    except ValueError:
        return resp.text
    if isinstance(data, dict) and "output" in data:
        suffix = f"\n(exit code {data['returncode']})" if "returncode" in data else ""
        return data["output"] + suffix
    if isinstance(data, dict) and "detail" in data:
        return str(data["detail"])
    return json.dumps(data, indent=2)


def get_server_uptime_seconds(db: Session) -> int | None:
    """How long BackEnd_V2 has likely been running, computed from
    BackOffice's own restart history rather than measured directly —
    psutil.Process.create_time() is confirmed permission-denied on at
    least one real device (needs a /proc/stat read that device refuses),
    so this exists as the fallback. Only as accurate as BackOffice's own
    record of restarts it triggered: a restart from anywhere else (a
    deploy, something manual on the device, Android killing the process)
    isn't reflected here, so this can overstate the real uptime. Only
    "success"/"unknown" restarts count — "failed" means the request to
    the control server itself errored, which doesn't necessarily mean
    anything actually restarted.
    """
    log = (
        db.query(RestartLogDBM)
        .filter(RestartLogDBM.status.in_(["success", "unknown"]), RestartLogDBM.completed_at.isnot(None))
        .order_by(RestartLogDBM.completed_at.desc())
        .first()
    )
    if log is None or log.completed_at is None:
        return None
    # SQLite round-trips DateTime columns as naive — completed_at was
    # written as datetime.now(timezone.utc), so it's UTC even though the
    # tzinfo itself didn't survive the round trip.
    completed_at = log.completed_at.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - completed_at).total_seconds()))


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

        try:
            resp = _client.post(
                f"{settings.control_server_url}/control/main/restart",
                headers={"X-Control-Secret": settings.control_secret},
            )
            log.log_output = f"control server responded: {resp.status_code}\n{_control_response_text(resp)}"
            if resp.status_code >= 400:
                log.status = "failed"
                log.completed_at = datetime.now(timezone.utc)
                log.duration_seconds = time.monotonic() - started
                db.commit()
                return
        except httpx.RequestError as e:
            log.status = "failed"
            log.log_output = f"ERROR: could not reach control server: {e}"
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
