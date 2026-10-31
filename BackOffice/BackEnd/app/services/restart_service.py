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
import logging
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timezone import ensure_utc
from app.db.session import SessionLocal, settle_row
from app.models.deployment_log import DeploymentLogDBM
from app.models.restart_log import RestartLogDBM
from app.services import deploy_service, self_restart, shadow_client

logger = logging.getLogger(__name__)

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


def get_server_uptime_seconds(db: Session, app: str = "shadow") -> int | None:
    """How long the given app has likely been running, computed from
    BackOffice's own restart history rather than measured directly —
    psutil.Process.create_time() is confirmed permission-denied on at
    least one real device (needs a /proc/stat read that device refuses),
    so this exists as the fallback.

    Both a plain restart and a deploy/rollback restart the app (the Control
    Server runs restart_server.sh for all three), so the clock starts at
    whichever of them finished last. Only restarts BackOffice itself
    triggered are known: one from anywhere else (something manual on the
    device, Android killing the process) isn't reflected, so this can
    overstate the real uptime. Only "success"/"unknown" count — "failed"
    means the request to the control server itself errored, which doesn't
    necessarily mean anything actually restarted.
    """
    last_restart = (
        db.query(RestartLogDBM.completed_at)
        .filter(
            RestartLogDBM.app == app,
            RestartLogDBM.status.in_(["success", "unknown"]),
            RestartLogDBM.completed_at.isnot(None),
        )
        .order_by(RestartLogDBM.completed_at.desc())
        .limit(1)
        .scalar()
    )
    last_deploy = (
        db.query(DeploymentLogDBM.completed_at)
        .filter(
            DeploymentLogDBM.app == app,
            DeploymentLogDBM.status.in_(["success", "unknown"]),
            DeploymentLogDBM.completed_at.isnot(None),
        )
        .order_by(DeploymentLogDBM.completed_at.desc())
        .limit(1)
        .scalar()
    )
    started_at = max((t for t in (last_restart, last_deploy) if t is not None), default=None)
    if started_at is None:
        return None
    # SQLite round-trips DateTime columns as naive — both columns are written
    # as datetime.now(timezone.utc), so they're UTC even though the tzinfo
    # itself didn't survive the round trip.
    started_at = started_at.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - started_at).total_seconds()))


def create_restart_record(db: Session, initiated_by: str, app: str = "shadow") -> RestartLogDBM:
    log = RestartLogDBM(trigger="manual", initiated_by=initiated_by, status="running", app=app)
    return deploy_service.start_job(db, log, app)


def _finish_restart(db: Session, log: RestartLogDBM, started: float, status: str, output: str) -> None:
    """Writes the outcome only while the row is still running, so a startup settle that got there first keeps its outcome."""
    if not settle_row(
        db, RestartLogDBM, log.id, ("running",),
        status=status, log_output=output, completed_at=datetime.now(timezone.utc),
        duration_seconds=time.monotonic() - started,
    ):
        logger.warning("restart %s was settled before its job finished; its %s outcome was not recorded", log.id, status)


def run_restart_job(restart_id: int, app: str = "shadow") -> None:
    """Runs as a FastAPI BackgroundTask with its own DB session.

    A restart changes no code, so its verdict needs only the Control Server's exit code and, for
    BackEnd_V2, a process that started after the request and answers its health check. A BackOffice
    restart ends this process before it can record the answer, so that row is settled at startup instead
    (settle_interrupted_restarts, called from main.py)."""
    db = SessionLocal()
    log: RestartLogDBM | None = None
    started = time.monotonic()
    sent = False
    control_segment = "backoffice" if app == "backoffice" else "main"
    try:
        log = db.get(RestartLogDBM, restart_id)
        if log is None:
            return

        if app == "backoffice":
            self_restart.announce_self_restart(db, log, [])
        try:
            sent = True
            resp = _client.post(
                f"{settings.control_server_url}/control/{control_segment}/restart",
                headers={"X-Control-Secret": settings.control_secret},
                timeout=deploy_service.RESTART_CALL_TIMEOUT_S,
            )
        except httpx.RequestError as e:
            if isinstance(e, deploy_service.NOT_SENT_ERRORS):
                _finish_restart(db, log, started, "failed", f"ERROR: could not reach control server: {e}")
            else:
                _finish_restart(db, log, started, "unknown", f"ERROR: the request was sent, but no answer came back ({e}). Check /server/log.")
            return

        code = resp.status_code
        data = deploy_service.control_json(resp)
        output = f"control server responded: {code}\n{_control_response_text(resp)}"
        if 400 <= code < 500:
            _finish_restart(db, log, started, "failed", output + "\nThe Control Server rejected the request, so nothing ran.")
            return
        if code >= 500 or not isinstance(data, dict) or not isinstance(data.get("returncode"), int):
            _finish_restart(db, log, started, "unknown", output + "\nThe Control Server's answer does not show whether the restart ran.")
            return
        if data["returncode"] != 0:
            _finish_restart(db, log, started, "failed", output + f"\nThe restart script exited with code {data['returncode']}.")
            return
        if app == "backoffice":
            # The restart kills this process, so an answer that reaches it means BackOffice was not replaced.
            _finish_restart(db, log, started, "unknown", output + "\nThe restart reported success, but this BackOffice process was not replaced.")
            return
        requested = ensure_utc(log.started_at)
        payload = shadow_client.wait_for_restarted(requested)
        if payload is None:
            status, line = "unknown", "Shadow did not report a process started after the restart was requested, within the timeout. Check /server/log."
        else:
            status, line = deploy_service.restart_verdict(app, requested, deploy_service.shadow_evidence(payload))
        _finish_restart(db, log, started, status, output + "\n" + line)
    except Exception as e:
        if log is not None:
            try:
                _finish_restart(db, log, started, "unknown" if sent else "failed", f"ERROR: unexpected failure — {e}")
            except Exception:
                pass
    finally:
        db.close()


def reconcile_unsettled_restarts(app: str, force: bool = False) -> None:
    """Settles this app's restart logs left "unknown", from the running process (see restart_verdict): a process that
    started after the request settles success, and one that has not started by the time limit settles failed. Reads call
    this throttled like the deploy logs (see reconcile_due), and startup passes `force`. As for deploys, a Control Server
    that does not answer leaves them as they are. A recheck never moves completed_at, which the uptime counts from."""
    if not deploy_service.reconcile_due(f"restart:{app}", force):
        return
    with SessionLocal() as db:
        unknown = [
            (row.id, ensure_utc(row.started_at))
            for row in db.query(RestartLogDBM).filter(RestartLogDBM.app == app, RestartLogDBM.status == "unknown")
        ]
    if not unknown or not deploy_service.control_server_answers(app):
        return
    now = datetime.now(timezone.utc)
    evidence = (
        deploy_service.own_evidence() if app == "backoffice"
        else deploy_service.shadow_evidence(shadow_client.check_health())
    )
    for restart_id, requested in unknown:
        status, line = deploy_service.restart_verdict(
            app, requested, evidence, window_passed=now - requested >= deploy_service.JOB_TIME_LIMIT,
        )
        if status == "unknown":
            continue
        with SessionLocal() as db:
            settle_row(
                db, RestartLogDBM, restart_id, ("unknown",),
                status=status, log_output=RestartLogDBM.log_output + f"\nChecked again: {line}",
            )


def settle_interrupted_restarts() -> None:
    """Startup. A restart still "running" was cut short when the process before this one stopped. A BackOffice restart it
    announced is judged by this process: it succeeded only if this process started after the request. Anything else is
    unknown. Then every open restart log is rechecked, as on a read (see reconcile_unsettled_restarts)."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        running = [
            (row.id, row.app, row.log_output, ensure_utc(row.started_at))
            for row in db.query(RestartLogDBM).filter(RestartLogDBM.status == "running")
        ]
    for restart_id, app, log_output, requested in running:
        with SessionLocal() as db:
            if app == "backoffice" and self_restart.was_announced(log_output):
                status, line = deploy_service.restart_verdict(app, requested, deploy_service.own_evidence())
                if status == "success":
                    line = f"{line}\n{self_restart.confirmation_line()}"
                settle_row(
                    db, RestartLogDBM, restart_id, ("running",),
                    status=status, log_output=RestartLogDBM.log_output + f"\n{line}", completed_at=now,
                )
            else:
                settle_row(
                    db, RestartLogDBM, restart_id, ("running",),
                    status="unknown",
                    log_output=RestartLogDBM.log_output + "\n[backoffice] Interrupted by a BackOffice restart before this finished.",
                    completed_at=now,
                )
    reconcile_unsettled_restarts("shadow", force=True)
    reconcile_unsettled_restarts("backoffice", force=True)
