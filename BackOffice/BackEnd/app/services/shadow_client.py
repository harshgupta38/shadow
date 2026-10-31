"""Thin HTTP client for BackEnd_V2's public /health endpoint.

Everything that used to live here for BackEnd_V2's `/admin/*` surface
(SQL console, blob fetch, backups, log tailing) now reads shadow.db and
its files directly — see shadow_db_service.py. /health is different: it's
a real live-process check (is BackEnd_V2 up and answering right now), not
something a co-located file read can answer, so this module still exists
for exactly that one thing plus restart-completion polling built on it.
"""

import time
from datetime import datetime

import httpx

from app.core.config import settings
from app.core.timezone import parse_utc

# A shared, persistent client rather than one-off httpx.get() calls —
# reused across every health check/poll this process makes.
_client = httpx.Client(timeout=15.0)


def check_health() -> dict | None:
    """Returns BackEnd_V2's /health payload when it reports status "ok", or None if it is unreachable or not ok —
    used both to show live status and to detect a restart completing (the process goes unreachable, then answers
    again once the new workers are up). A 200 that says otherwise is not a healthy server.
    """
    try:
        resp = _client.get(f"{settings.shadow_backend_url}/health", timeout=5.0)
    except httpx.RequestError:
        return None
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) and data.get("status") == "ok" else None


def check_backoffice_health() -> dict | None:
    """Confirms BackOffice itself is reachable, via the Control Server's own
    /health/backoffice probe rather than asking this process directly —
    "am I up" is tautological when this very code has to run to answer it.
    The Control Server is the one genuinely external vantage point available
    for that question.

    The probe answers HTTP 200 even when BackOffice is down, with {"status": "down"}
    in the body, so only an "ok" status counts as healthy.
    """
    try:
        resp = _client.get(f"{settings.control_server_url}/health/backoffice", timeout=5.0)
    except httpx.RequestError:
        return None
    if resp.status_code != 200:
        return None
    try:
        data = resp.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) and data.get("status") == "ok" else None


def check_target_health(app: str) -> dict | None:
    return check_backoffice_health() if app == "backoffice" else check_health()


def wait_for_restarted(requested_at: datetime, timeout: float = 60.0, interval: float = 2.0) -> dict | None:
    """Polls BackEnd_V2's health until a process that started after `requested_at` answers with status ok, and returns
    that payload, or None if none does in time. A process that started earlier is ignored whatever it reports: the
    request is what starts the new process, and anything older still runs the code from before the request.
    """
    deadline = time.monotonic() + timeout
    while True:
        payload = check_health()
        started = parse_utc(payload.get("started_at")) if payload else None
        if started is not None and started >= requested_at:
            return payload
        if time.monotonic() >= deadline:
            return None
        time.sleep(interval)
