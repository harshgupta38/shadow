"""Where the exercise photos live, and the versioned URLs the API hands out for them."""

import mimetypes
from functools import lru_cache
from pathlib import Path

from app.core.endpoints import ENDPOINTS

MEDIA_DIR = Path(__file__).resolve().parents[1] / "data" / "workout" / "media"
MEDIA_ROUTE = f"{ENDPOINTS.WORKOUT.PREFIX}/media"

# Windows and some Android builds do not know WebP, and the file would then be served as plain text.
mimetypes.add_type("image/webp", ".webp")


@lru_cache(maxsize=1)
def _modified_times() -> dict[str, int]:
    # A replaced file gets a new modification time, so its URL changes with it. The same URL always means the same
    # bytes, which is what lets browsers keep each photo without asking the server again.
    return {
        path.relative_to(MEDIA_DIR).as_posix(): int(path.stat().st_mtime)
        for path in MEDIA_DIR.rglob("*")
        if path.is_file()
    }


def media_url(route_path: str) -> str:
    """Turns a stored path such as /workout/media/3-4-sit-up/0.jpg into the URL to load, with its version."""
    version = _modified_times().get(route_path.removeprefix(f"{MEDIA_ROUTE}/"))
    return route_path if version is None else f"{route_path}?v={version}"


def thumbnail_url(slug: str) -> str:
    """Small still WebP for lists: the exercise's first photo, or the first frame of its GIF when it has no photo. The GIF
    plays on the exercise's own page, which opens with it."""
    return media_url(f"{MEDIA_ROUTE}/{slug}/thumb.webp")
