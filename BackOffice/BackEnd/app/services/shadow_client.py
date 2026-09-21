"""HTTP client for calling the live BackEnd_V2 instance this tool manages.

BackOffice never re-implements SQL execution, database backup, or health
reporting — it calls BackEnd_V2's existing endpoints (app/api/system.py),
the same ones already reachable via curl with the admin secret. This keeps
exactly one code path for anything that touches shadow.db directly.
"""

import time

import httpx

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError, ServiceUnavailableError

# A shared, persistent client instead of one-off httpx.post/get calls: list_tables()
# alone fires ~3 requests per table (23 tables live in shadow.db today), and opening
# a fresh TCP connection for every single one made that endpoint take 15-20s. httpx.Client
# is safe to share across the threads FastAPI runs sync endpoints in.
_client = httpx.Client(timeout=15.0)


def _admin_request(
    method: str,
    path: str,
    *,
    not_found_message: str | None = None,
    error_message: str,
    timeout: float | None = None,
    json: dict | None = None,
) -> httpx.Response:
    """Shared request + error handling for every BackEnd_V2 /admin/* call
    below — a network failure, a rejected admin secret, and a generic
    non-2xx response (surfacing BackEnd_V2's own `detail` message when it
    sent one) mean the same thing everywhere here. `not_found_message` is
    only passed where a 404 has a specific meaning (a backup filename that
    doesn't exist) — otherwise a 404 just falls through to the generic
    error path below.
    """
    kwargs: dict = {"headers": {"X-Admin-Secret": settings.shadow_admin_secret}}
    if timeout is not None:
        kwargs["timeout"] = timeout
    if json is not None:
        kwargs["json"] = json

    try:
        resp = _client.request(method, f"{settings.shadow_backend_url}{path}", **kwargs)
    except httpx.RequestError as e:
        raise ServiceUnavailableError(f"Could not reach Shadow V2 backend: {e}")

    if resp.status_code == 404 and not_found_message:
        raise NotFoundError(not_found_message)
    if resp.status_code == 403:
        raise ServiceUnavailableError(
            "Shadow V2 rejected the admin secret — check SHADOW_ADMIN_SECRET in BackOffice's .env."
        )
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", error_message)
        except ValueError:
            detail = error_message
        raise AppError(detail)

    return resp


def run_sql(query: str) -> dict:
    """Executes one SQL statement against shadow.db via BackEnd_V2's
    POST /admin/sql. Raises AppError (400) with the underlying sqlite error
    message on failure, matching what that endpoint already returns.
    """
    resp = _admin_request("POST", "/admin/sql", json={"query": query}, error_message="Query failed.")
    return resp.json()  # {"rowcount": int, "columns": [str], "rows": [dict]}


def run_backup_sql(filename: str, query: str) -> dict:
    """Executes one read-only SQL statement against a specific backup file
    via BackEnd_V2's POST /admin/backups/{filename}/query. BackEnd_V2 opens
    that file in SQLite's own read-only mode, so a write attempt fails
    there regardless of what's sent here — this client has nothing extra
    to enforce, same trust boundary as run_sql().
    """
    resp = _admin_request(
        "POST",
        f"/admin/backups/{filename}/query",
        json={"query": query},
        not_found_message=f"Backup '{filename}' not found.",
        error_message="Query failed.",
    )
    return resp.json()  # {"rowcount": int, "columns": [str], "rows": [dict]}


def list_backups() -> list[dict]:
    """Shadow V2's persistent backup archive (BackEnd_V2/backups/, written
    by its own daily-scheduled backup_service) via GET /admin/backups —
    BackOffice never keeps a second copy of this listing."""
    resp = _admin_request("GET", "/admin/backups", error_message="Could not list backups.")
    return resp.json()  # [{"name": str, "created_at": str, "size_bytes": int}]


def create_backup() -> dict:
    """Triggers one backup right now via POST /admin/backups — the exact
    same backup_service.create_backup() the daily scheduler already calls,
    just fired on demand instead of waiting for the next scheduled slot.
    A longer timeout than the other calls here: backing up a large SQLite
    file takes real time, and this one shouldn't time out mid-copy."""
    resp = _admin_request("POST", "/admin/backups", timeout=60.0, error_message="Backup failed.")
    return resp.json()  # {"name": str, "created_at": str, "size_bytes": int}


def download_backup(filename: str) -> bytes:
    """Streams one existing backup file's bytes through from
    GET /admin/backups/{filename} — BackOffice never stores its own copy,
    it's purely a pass-through. BackEnd_V2 only serves a name that's
    literally present in its backup directory (see get_backup_path there),
    so there's nothing to validate on this side either."""
    resp = _admin_request(
        "GET",
        f"/admin/backups/{filename}",
        timeout=30.0,
        not_found_message=f"Backup '{filename}' not found.",
        error_message="Could not download backup.",
    )
    return resp.content


def restore_backup(filename: str) -> dict:
    """Overwrites shadow.db with a backup's contents via
    POST /admin/backups/{filename}/restore — BackEnd_V2 takes a fresh
    safety snapshot of the CURRENT database before touching anything, so
    the pre-restore state is never lost, then restores the requested
    backup over the live file. A generous timeout: this does two full
    SQLite backup-API copies back to back (the safety snapshot, then the
    restore itself), not one."""
    resp = _admin_request(
        "POST",
        f"/admin/backups/{filename}/restore",
        timeout=90.0,
        not_found_message=f"Backup '{filename}' not found.",
        error_message="Restore failed.",
    )
    return resp.json()  # {"restored_from": str, "pre_restore_backup": {...}}


def delete_backup(filename: str) -> dict:
    """Permanently removes one backup file via DELETE
    /admin/backups/{filename} — irreversible on BackEnd_V2's side, so this
    client adds no confirmation of its own; that already happened before
    this call was made."""
    resp = _admin_request(
        "DELETE",
        f"/admin/backups/{filename}",
        timeout=15.0,
        not_found_message=f"Backup '{filename}' not found.",
        error_message="Delete failed.",
    )
    return resp.json()  # {"deleted": str}


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


def log_ws_url() -> str:
    """ws(s):// URL for BackEnd_V2's real-time log-stream websocket
    (/admin/logs/ws) — BackOffice's own log_ws (app.api.server) connects
    here directly with the `websockets` library and the same
    X-Admin-Secret header every other call in this module uses over
    plain HTTP. httpx (this module's shared client, used everywhere
    else here) doesn't speak websockets, so this just builds the URL
    rather than reusing _admin_request.
    """
    return settings.shadow_backend_url.replace("http", "ws", 1) + "/admin/logs/ws"


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
