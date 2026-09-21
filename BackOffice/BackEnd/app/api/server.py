import asyncio
import contextlib
import logging

import websockets
from fastapi import APIRouter, BackgroundTasks, WebSocket, WebSocketDisconnect

from app.api.deps import COOKIE_NAME, CurrentAdmin, DbSession
from app.core import security
from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import NotFoundError
from app.db.session import SessionLocal
from app.models.restart_log import RestartLogDBM
from app.schemas.server import RestartResponse, ServerHealthResponse
from app.services import auth_service, restart_service, shadow_client, worker_service

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


def _authenticate_ws(websocket: WebSocket) -> bool:
    """Same cookie/JWT check as CurrentAdmin (app.api.deps.get_current_admin)
    — that dependency is typed against a plain HTTP Request, which a
    websocket connection doesn't have, so this re-implements the same
    check against WebSocket.cookies instead of trying to make one
    dependency serve both kinds of route."""
    token = websocket.cookies.get(COOKIE_NAME)
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
    await websocket.accept()
    if not _authenticate_ws(websocket):
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


async def _relay_upstream_log(upstream, websocket: WebSocket) -> None:
    """Forwards every line BackEnd_V2 sends straight through to the
    browser, unmodified — the ANSI escape codes already in server.log
    are exactly what let the frontend render this like a real terminal,
    so nothing here should touch the text itself."""
    async for message in upstream:
        text = message if isinstance(message, str) else message.decode("utf-8", "replace")
        await websocket.send_text(text)


@router.websocket(ENDPOINTS.SERVER.LOG_WS)
async def log_ws(websocket: WebSocket):
    """Relays BackEnd_V2's real-time server.log websocket through to the
    browser — connections are opened deliberately by the frontend (the
    Logs page's play button), never on a timer, so this only ever costs
    anything while an admin is actually watching. BackOffice never lets
    the browser talk to BackEnd_V2 directly (same rule as every other
    call in shadow_client), so this acts as a websocket client to
    BackEnd_V2 and a websocket server to the browser at the same time.

    Races two tasks rather than only watching the browser's own socket:
    relay_task ending (BackEnd_V2 closed the connection — its own 20-minute
    cap, a restart, anything) needs to be noticed too, or this would sit
    open forever silently relaying nothing while the browser has no idea
    the feed died. disconnect_task existing purely to detect the browser
    hanging up (it never sends anything meaningful) restarts itself on any
    non-disconnect receive, same "not actually terminal" handling as
    health_ws's own recv_task above.
    """
    await websocket.accept()
    if not _authenticate_ws(websocket):
        await websocket.close(code=4401, reason="Not authenticated")
        return

    try:
        async with websockets.connect(
            shadow_client.log_ws_url(),
            additional_headers={"X-Admin-Secret": settings.shadow_admin_secret},
            open_timeout=10,
        ) as upstream:
            relay_task = asyncio.ensure_future(_relay_upstream_log(upstream, websocket))
            disconnect_task = asyncio.ensure_future(websocket.receive_text())
            try:
                while True:
                    done, _ = await asyncio.wait({relay_task, disconnect_task}, return_when=asyncio.FIRST_COMPLETED)
                    if relay_task in done:
                        relay_task.result()  # returns normally if BackEnd_V2 just closed; raises on a real failure
                        break  # nothing left to relay either way — stop
                    disconnect_task.result()  # raises WebSocketDisconnect if that's what happened
                    disconnect_task = asyncio.ensure_future(websocket.receive_text())  # an inert message — keep waiting
            finally:
                relay_task.cancel()
                disconnect_task.cancel()
                with contextlib.suppress(Exception, asyncio.CancelledError):
                    await relay_task
                with contextlib.suppress(Exception, asyncio.CancelledError):
                    await disconnect_task
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("log_ws: could not reach BackEnd_V2's log stream.")
        with contextlib.suppress(Exception):
            await websocket.send_text("Could not reach Shadow V2's log stream.")


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
