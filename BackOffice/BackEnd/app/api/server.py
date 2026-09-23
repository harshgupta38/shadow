import asyncio
import contextlib
import logging

from fastapi import APIRouter, BackgroundTasks, WebSocket, WebSocketDisconnect

from app.api.deps import CurrentAdmin, DbSession
from app.core import security
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import NotFoundError
from app.db.session import SessionLocal
from app.models.restart_log import RestartLogDBM
from app.schemas.server import RestartResponse, ServerHealthResponse
from app.services import auth_service, restart_service, shadow_client, shadow_db_service, worker_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix=ENDPOINTS.SERVER.PREFIX, tags=["Server"])

# How often health_ws pushes a snapshot, and how long one connection is
# allowed to stay open before the server closes it (the frontend
# reconnects) — same capped-session convention BackEnd_V2's own SSE
# streams already use, so a stalled/orphaned client can't pin resources
# on a phone indefinitely.
_HEALTH_PUSH_INTERVAL_S = 5.0
_HEALTH_WS_MAX_DURATION_S = 20 * 60


def _build_health_response() -> ServerHealthResponse:
    """The full health snapshot — shared by the plain GET (Dashboard's
    one-time fetch on load) and the websocket push below (the Server
    page's live view), so there's exactly one place assembling this."""
    shadow_health = shadow_client.check_health()
    host = worker_service.get_host_stats()
    battery = worker_service.get_battery() or {}
    workers = worker_service.get_workers()
    with SessionLocal() as db:
        server_uptime_seconds = restart_service.get_server_uptime_seconds(db)

    return ServerHealthResponse(
        reachable=shadow_health is not None,
        message=(shadow_health or {}).get("message"),
        battery_percent=battery.get("percentage"),
        battery_status=battery.get("status"),
        battery_temperature_c=battery.get("temperature"),
        battery_plugged=battery.get("plugged"),
        workers=workers,
        expected_workers=(shadow_health or {}).get("expected_workers"),
        server_uptime_seconds=server_uptime_seconds,
        **host,
    )


@router.get(ENDPOINTS.SERVER.HEALTH, response_model=ServerHealthResponse)
def get_health(_admin: CurrentAdmin):
    return _build_health_response()


def _ws_bearer_token(websocket: WebSocket) -> str | None:
    """The frontend passes its auth token as a Sec-WebSocket-Protocol
    entry (see healthWsProtocols/logWsProtocols) rather than a query
    parameter — confirmed in practice that uvicorn's access log records a
    request's full path *including* its query string ("WebSocket
    /server/health/ws?token=eyJ..." shows up verbatim in backoffice.log),
    which would write the raw token into a plaintext log file on every
    single connection. A native WebSocket can't set an Authorization
    header on its handshake the way axios does for normal requests, so
    this is the closest equivalent that doesn't end up logged. Read
    before accept() (nothing about the ASGI scope requires accepting
    first) so the caller can echo the token straight back as the
    connection's accepted subprotocol."""
    protocols = websocket.scope.get("subprotocols") or []
    return protocols[0] if protocols else None


def _authenticate_ws(token: str | None) -> bool:
    """Same Bearer/JWT check as CurrentAdmin (app.api.deps.get_current_admin)
    — that dependency reads an Authorization header off a plain HTTP
    Request, which a websocket handshake doesn't have, so this validates
    the token handed to it directly instead (see _ws_bearer_token)."""
    if not token:
        return False
    try:
        payload = security.decode_access_token(token)
        admin_id = int(payload.get("sub", ""))
    except (security.JWTError, TypeError, ValueError):
        return False
    with SessionLocal() as db:
        admin = auth_service.get_admin_by_id(db, admin_id)
        return admin is not None and admin.is_active


@router.websocket(ENDPOINTS.SERVER.HEALTH_WS)
async def health_ws(websocket: WebSocket):
    """Pushes a health snapshot every few seconds instead of the Server
    page polling GET /server/health on a timer — every poll ran real
    psutil process-scanning plus a request to BackEnd_V2 regardless of
    whether anything had actually changed, which on a phone-hosted
    server is cost worth avoiding.
    """
    token = _ws_bearer_token(websocket)
    await websocket.accept(subprotocol=token)
    if not _authenticate_ws(token):
        await websocket.close(code=4401, reason="Not authenticated")
        return

    elapsed = 0.0
    # A single long-lived receive_text() task, reused across ticks instead of
    # re-wrapped in a fresh asyncio.wait_for() each time: wait_for cancels its
    # inner coroutine the instant its timeout fires, and if the client's
    # disconnect happens to arrive right at that boundary, the cancellation
    # can win the race and the one-shot ASGI disconnect message is lost —
    # confirmed in practice as an extra full tick of pushes (a real request
    # to BackEnd_V2) still going out after the browser had already left, only
    # noticed on the *next* tick's receive call. asyncio.wait below never
    # cancels recv_task, so a disconnect arriving mid-tick is caught the
    # moment it happens instead of being delayed to the next tick boundary.
    recv_task = asyncio.ensure_future(websocket.receive_text())
    try:
        while elapsed < _HEALTH_WS_MAX_DURATION_S:
            # _build_health_response() is a blocking call (psutil, subprocess) —
            # run it off the event loop so it can't stall every other request
            # this process is handling while it waits on a slow/hanging one.
            snapshot = await asyncio.to_thread(_build_health_response)
            await websocket.send_text(snapshot.model_dump_json())

            done, _ = await asyncio.wait({recv_task}, timeout=_HEALTH_PUSH_INTERVAL_S)
            if recv_task in done:
                recv_task.result()  # raises WebSocketDisconnect if that's what happened
                recv_task = asyncio.ensure_future(websocket.receive_text())  # a real "refresh" nudge — listen again
            elapsed += _HEALTH_PUSH_INTERVAL_S
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("health_ws: unexpected error, closing connection.")
    finally:
        recv_task.cancel()
        with contextlib.suppress(Exception, asyncio.CancelledError):
            await recv_task


@router.get(ENDPOINTS.SERVER.WORKERS)
def get_workers(_admin: CurrentAdmin):
    return worker_service.get_workers()


# How often log_ws polls server.log for newly appended bytes, and how long
# one connection is allowed to stay open before the server closes it (the
# frontend reconnects) — same capped-session convention health_ws above
# uses, so a stalled/orphaned client can't pin resources indefinitely.
_LOG_WS_TICK_S = 1.0
_LOG_WS_MAX_DURATION_S = 20 * 60
_LOG_SEED_LINES = 50


@router.websocket(ENDPOINTS.SERVER.LOG_WS)
async def log_ws(websocket: WebSocket):
    """Tails BackEnd_V2's server.log directly off disk — both apps are
    co-located on the same device (see SHADOW_BACKEND_DIR), so there's no
    reason to hop through a second websocket (BackEnd_V2's own former
    /admin/logs/ws) just to read a file this process can already open
    itself. Seeds with the last 50 lines, then only ever reads bytes newly
    appended since the last check (never re-reads the whole file), so
    watching this indefinitely costs nothing proportional to the file's
    total size.
    """
    token = _ws_bearer_token(websocket)
    await websocket.accept(subprotocol=token)
    if not _authenticate_ws(token):
        await websocket.close(code=4401, reason="Not authenticated")
        return

    recv_task = asyncio.ensure_future(websocket.receive_text())
    try:
        if not await asyncio.to_thread(shadow_db_service.log_exists):
            await websocket.send_text("server.log not found.")
            return

        seed_lines = await asyncio.to_thread(shadow_db_service.read_log_tail, _LOG_SEED_LINES)
        for line in seed_lines:
            await websocket.send_text(line)
        position = await asyncio.to_thread(shadow_db_service.log_size)

        elapsed = 0.0
        while elapsed < _LOG_WS_MAX_DURATION_S:
            done, _ = await asyncio.wait({recv_task}, timeout=_LOG_WS_TICK_S)
            if recv_task in done:
                recv_task.result()  # raises WebSocketDisconnect if that's what happened
                recv_task = asyncio.ensure_future(websocket.receive_text())  # an inert message — keep waiting
            elapsed += _LOG_WS_TICK_S

            new_text, position = await asyncio.to_thread(shadow_db_service.read_log_since, position)
            if new_text:
                for line in new_text.splitlines():
                    await websocket.send_text(line)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("log_ws: unexpected error while tailing server.log.")
    finally:
        recv_task.cancel()
        with contextlib.suppress(Exception, asyncio.CancelledError):
            await recv_task


@router.get(ENDPOINTS.SERVER.RESTART_HISTORY, response_model=list[RestartResponse])
def get_restart_history(db: DbSession, _admin: CurrentAdmin, page: int = 1, page_size: int = 10):
    offset = max(page - 1, 0) * page_size
    return (
        db.query(RestartLogDBM)
        .order_by(RestartLogDBM.started_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )


@router.post(ENDPOINTS.SERVER.RESTART, response_model=RestartResponse)
def restart(background_tasks: BackgroundTasks, db: DbSession, admin: CurrentAdmin):
    log = restart_service.create_restart_record(db, admin.email)
    background_tasks.add_task(restart_service.run_restart_job, log.id)
    return log


@router.get(ENDPOINTS.SERVER.RESTART_DETAIL, response_model=RestartResponse)
def get_restart(restart_id: int, db: DbSession, _admin: CurrentAdmin):
    log = db.get(RestartLogDBM, restart_id)
    if log is None:
        raise NotFoundError("Restart record not found.")
    return log
