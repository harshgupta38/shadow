"""HTTP client for calling the live BackEnd_V2 instance this tool manages.

BackOffice never re-implements SQL execution, database backup, or health
reporting — it calls BackEnd_V2's existing endpoints (app/api/system.py),
the same ones already reachable via curl with the admin secret. This keeps
exactly one code path for anything that touches shadow.db directly.
"""

import time

import httpx

from app.core.config import settings
from app.core.exceptions import AppError, ServiceUnavailableError

# A shared, persistent client instead of one-off httpx.post/get calls: list_tables()
# alone fires ~3 requests per table (23 tables live in shadow.db today), and opening
# a fresh TCP connection for every single one made that endpoint take 15-20s. httpx.Client
# is safe to share across the threads FastAPI runs sync endpoints in.
_client = httpx.Client(timeout=15.0)


def run_sql(query: str) -> dict:
    """Executes one SQL statement against shadow.db via BackEnd_V2's
    POST /admin/sql. Raises AppError (400) with the underlying sqlite error
    message on failure, matching what that endpoint already returns.
    """
    try:
        resp = _client.post(
            f"{settings.shadow_backend_url}/admin/sql",
            json={"query": query},
            headers={"X-Admin-Secret": settings.shadow_admin_secret},
        )
    except httpx.RequestError as e:
        raise ServiceUnavailableError(f"Could not reach Shadow V2 backend: {e}")

    if resp.status_code == 403:
        raise ServiceUnavailableError(
            "Shadow V2 rejected the admin secret — check SHADOW_ADMIN_SECRET in BackOffice's .env."
        )
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", "Query failed.")
        except ValueError:
            detail = "Query failed."
        raise AppError(detail)

    return resp.json()  # {"rowcount": int, "columns": [str], "rows": [dict]}


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


def fetch_server_log(tail_lines: int = 200) -> str:
    """Tails BackEnd_V2's server.log via its existing GET /server/log."""
    try:
        resp = _client.get(f"{settings.shadow_backend_url}/server/log", timeout=10.0)
    except httpx.RequestError:
        return ""
    if resp.status_code != 200:
        return ""
    lines = resp.text.splitlines()
    return "\n".join(lines[-tail_lines:])


def wait_for_restart(timeout: float = 60.0, interval: float = 2.0) -> bool:
    """Best-effort confirmation that a restart actually happened: polls
    /health until it's seen going down and then coming back up. Both the
    webhook (fire-and-forget) and a direct restart_server.sh invocation give
    no synchronous success signal, so this is the only real confirmation
    available without modifying BackEnd_V2 itself.
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
