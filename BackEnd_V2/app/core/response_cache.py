"""In-memory cache of finished JSON responses for expensive read-only endpoints.

Each uvicorn worker keeps its own copy, so correctness cannot rely on the cache being shared.
Instead every entry is stored under the global data version (see app/db/change_tracking.py) and is
served only while that version is unchanged. A write handled by *any* worker bumps the version in
the database, so every other worker drops its entries on their next request.

Entries are also keyed by user, endpoint, parameters and today's IST date, and expire after a short
TTL. The TTL bounds staleness for changes the tracker cannot see: time passing (statuses that are
derived from the clock) and writes made outside the app, such as the BackOffice editing the file.

A hit skips both the computation and FastAPI's response validation, because the cached value is the
final serialized JSON.
"""
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import Response  # pyright: ignore[reportMissingImports]
from pydantic_core import to_json  # pyright: ignore[reportMissingImports]
from sqlalchemy import select  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Session  # pyright: ignore[reportMissingImports]

from app.common import today_ist
from app.core.config import settings
from app.models.data_version import DATA_VERSION_ROW_ID, DataVersionDBM
from app.models.user import UserDBM

# Data the server derives from the clock as well as from stored rows (today's plan, dashboard, tracking).
TTL_SHORT_SECONDS = 30
# Lists and range views that change only when something is written.
TTL_STANDARD_SECONDS = 60

CACHE_HEADER = "X-Cache"

_CacheKey = tuple[int, str, tuple, Any]


@dataclass(slots=True)
class _Entry:
    version: int
    expires_at: float
    body: bytes


class _LruBytesCache:
    """Thread-safe LRU bounded by entry count and total bytes (routes run in a thread pool)."""

    def __init__(self, max_entries: int, max_bytes: int) -> None:
        self._max_entries = max_entries
        self._max_bytes = max_bytes
        self._entries: OrderedDict[_CacheKey, _Entry] = OrderedDict()
        self._total_bytes = 0
        self._lock = threading.Lock()

    def get(self, key: _CacheKey, version: int) -> bytes | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.version != version or time.monotonic() >= entry.expires_at:
                self._remove(key)
                return None
            self._entries.move_to_end(key)
            return entry.body

    def put(self, key: _CacheKey, version: int, body: bytes, ttl_seconds: int) -> None:
        if len(body) > self._max_bytes:
            return
        with self._lock:
            if key in self._entries:
                self._remove(key)
            self._entries[key] = _Entry(version, time.monotonic() + ttl_seconds, body)
            self._total_bytes += len(body)
            while len(self._entries) > self._max_entries or self._total_bytes > self._max_bytes:
                self._remove(next(iter(self._entries)))

    def _remove(self, key: _CacheKey) -> None:
        self._total_bytes -= len(self._entries.pop(key).body)


_cache = _LruBytesCache(
    max_entries=settings.response_cache_max_entries,
    max_bytes=settings.response_cache_max_mb * 1024 * 1024,
)


def read_data_version(db: Session) -> int:
    return db.scalar(select(DataVersionDBM.version).where(DataVersionDBM.id == DATA_VERSION_ROW_ID)) or 0


def _json_response(body: bytes, outcome: str) -> Response:
    return Response(content=body, media_type="application/json", headers={CACHE_HEADER: outcome})


def cached_json_response(
    db: Session,
    user: UserDBM,
    name: str,
    compute: Callable[[], Any],
    *,
    ttl: int,
    params: tuple = (),
) -> Response:
    """Return `compute()` as a JSON response, served from memory while nothing has changed.

    `name` plus `params` must identify everything besides the user and today's date that the result
    depends on. `compute` may itself write (e.g. today's plan creates its records on first read);
    that only costs one extra miss, because the write moves the version.
    """
    if not settings.response_cache_enabled:
        return _json_response(to_json(compute(), by_alias=True), "BYPASS")

    user_id = user.id
    # The version must be read BEFORE computing: if a write lands in between, the entry is stored
    # under the older version and is discarded on the next request instead of being served stale.
    version = read_data_version(db)
    key: _CacheKey = (user_id, name, params, today_ist())

    cached = _cache.get(key, version)
    if cached is not None:
        return _json_response(cached, "HIT")

    body = to_json(compute(), by_alias=True)
    _cache.put(key, version, body, ttl)
    return _json_response(body, "MISS")
