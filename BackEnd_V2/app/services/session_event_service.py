import asyncio
import json
from typing import AsyncGenerator

_loop: asyncio.AbstractEventLoop | None = None
_session_queues: dict[int, "asyncio.Queue[dict]"] = {}


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe(session_id: int) -> "asyncio.Queue[dict]":
    q: asyncio.Queue[dict] = asyncio.Queue()
    _session_queues[session_id] = q
    return q


def unsubscribe(session_id: int) -> None:
    _session_queues.pop(session_id, None)


def notify_session_logout(session_id: int) -> None:
    """Push a logout event to the SSE stream for the given session (sync-safe)."""
    q = _session_queues.get(session_id)
    if q is not None and _loop is not None and _loop.is_running():
        _loop.call_soon_threadsafe(q.put_nowait, {"type": "logout"})


async def session_event_stream(
    session_id: int,
    shutdown_event: asyncio.Event,
) -> AsyncGenerator[str, None]:
    q = subscribe(session_id)
    try:
        elapsed = 0
        max_duration = 20 * 60
        while elapsed < max_duration and not shutdown_event.is_set():
            try:
                event = await asyncio.wait_for(q.get(), timeout=30)
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("type") == "logout":
                    break
            except asyncio.TimeoutError:
                elapsed += 30
                yield ": heartbeat\n\n"
    finally:
        unsubscribe(session_id)
