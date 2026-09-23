"""Thin HTTP client for BackEnd_V2's public /health endpoint.

Everything that used to live here for BackEnd_V2's `/admin/*` surface
(SQL console, blob fetch, backups, log tailing) now reads shadow.db and
its files directly — see shadow_db_service.py. /health is different: it's
a real live-process check (is BackEnd_V2 up and answering right now), not
something a co-located file read can answer, so this module still exists
for exactly that one thing plus restart-completion polling built on it.
"""

import time

import httpx

from app.core.config import settings

# A shared, persistent client rather than one-off httpx.get() calls —
# reused across every health check/poll this process makes.
_client = httpx.Client(timeout=15.0)


def check_health() -> dict | None:
    """Returns BackEnd_V2's /health payload, or None if unreachable — used
    both to show live status and to detect a restart completing (the process
    goes unreachable, then answers again once the new workers are up).
    """
    try:
        resp = _client.get(f"{settings.shadow_backend_url}/health", timeout=5.0)
    except httpx.RequestError:
        return None
    if resp.status_code != 200:
        return None
    try:
        return resp.json()
    except ValueError:
        return None


def wait_for_restart(timeout: float = 60.0, interval: float = 2.0) -> bool:
    """Best-effort confirmation that a restart actually happened: polls
    /health until it's seen going down and then coming back up. The Control
    Server's response confirms the restart_server.sh invocation itself
    exited cleanly, but not that uvicorn actually came back up — this is
    the real confirmation of that, without modifying BackEnd_V2 itself.
    """
    deadline = time.monotonic() + timeout
    seen_down = False
    while time.monotonic() < deadline:
        if check_health() is None:
            seen_down = True
        elif seen_down:
            return True
        time.sleep(interval)
    # Never observed a drop — the restart may have been faster than our poll
    # interval, or never actually happened. Fall back to a final health check.
    return check_health() is not None

