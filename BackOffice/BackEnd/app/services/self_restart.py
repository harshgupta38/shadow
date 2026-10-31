"""Deploys and restarts of BackOffice *itself* kill the process that is running the job.

The job can therefore never write its own final status. Instead it records, before sending the
request, that the Control Server was asked to restart BackOffice, and for a deploy the commit it must
end up on. When the new process starts (app/main.py), a job still "running" with that record is known
to have reached the restart, and it is settled from evidence: this process's own commit and start time for
a deploy (deploy_service.settle_interrupted_deployments), and its start time for a plain restart
(restart_service.settle_interrupted_restarts).
"""
from sqlalchemy.orm import Session

from app.core.instance import INSTANCE_ID, STARTED_AT
from app.core.timezone import IST

# How long the frontend waits for the new process to answer before assuming the restart failed.
# Shown in the log text; the frontend holds its own matching constant.
RECOVERY_TIMEOUT_SECONDS = 30

SELF_RESTART_NOTICE = (
    "Request sent to the Control Server. BackOffice restarts itself as part of this, so this "
    f"connection will drop — the page waits up to {RECOVERY_TIMEOUT_SECONDS} s for the new process to answer."
)


def announce_self_restart(db: Session, log, lines: list[str]) -> None:
    """Persist that the restart request is about to be sent, before it is."""
    lines.append(SELF_RESTART_NOTICE)
    log.log_output = "\n".join(lines)
    db.commit()


def was_announced(log_output: str | None) -> bool:
    return SELF_RESTART_NOTICE in (log_output or "")


def confirmation_line() -> str:
    return (
        f"[backoffice] BackOffice came back up after the restart (process {INSTANCE_ID[:8]}, "
        f"started {STARTED_AT.astimezone(IST):%Y-%m-%d %H:%M:%S} IST) — restart confirmed."
    )
