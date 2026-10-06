import json
import logging
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from app.core.exceptions import ServiceUnavailableError

log = logging.getLogger("uvicorn.error")

_API = "https://api.sunrise-sunset.org/json"

# Cache sunrise/sunset per (rounded lat, rounded lng, date) for the rest of that day —
# avoids re-hitting the third-party API for every request from roughly the same spot,
# and for the second lookup (tomorrow's sunrise) once today's sunset has passed.
_cache: dict[tuple[float, float, date], tuple[datetime, datetime]] = {}


def _cache_key(lat: float, lng: float, d: date) -> tuple[float, float, date]:
    return (round(lat, 2), round(lng, 2), d)


def _fetch(lat: float, lng: float, d: date) -> tuple[datetime, datetime]:
    key = _cache_key(lat, lng, d)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    url = f"{_API}?lat={lat}&lng={lng}&date={d.isoformat()}&formatted=0"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise ServiceUnavailableError("Could not reach sunrise-sunset.org.") from exc

    if data.get("status") != "OK":
        raise ServiceUnavailableError(
            f"sunrise-sunset.org returned unexpected status: {data.get('status')}"
        )

    try:
        r = data["results"]
        result = (datetime.fromisoformat(r["sunrise"]), datetime.fromisoformat(r["sunset"]))
    except (KeyError, ValueError) as exc:
        raise ServiceUnavailableError("Unexpected response format from sunrise-sunset.org.") from exc

    _cache[key] = result
    return result


def _fallback_theme(now: datetime, lng: float) -> dict:
    """Used when the sunrise/sunset API is unreachable — a simple clock heuristic
    (dark outside 6am-6pm) so theme switching still roughly works instead of the
    whole appearance endpoint failing on a third-party outage.

    `now` is UTC, so checking its hour directly would use the wrong clock for
    almost every longitude (e.g. 8am IST is 2:30am UTC — that would wrongly pick
    dark mode). We don't have a timezone database for an exact local time, so we
    approximate local solar time from longitude instead: ~15 degrees of longitude
    per hour of UTC offset.
    """
    local_hour = (now.hour + now.minute / 60 + lng / 15) % 24
    theme = "light" if 6 <= local_hour < 18 else "dark"
    return {
        "effective_theme": theme,
        "sunrise": None,
        "sunset": None,
        "next_transition_at": None,
    }


def resolve_dynamic_theme(lat: float, lng: float) -> dict:
    now = datetime.now(tz=timezone.utc)
    try:
        sunrise, sunset = _fetch(lat, lng, now.date())
    except ServiceUnavailableError:
        log.warning("solar_service: sunrise-sunset.org unavailable, using clock fallback.")
        return _fallback_theme(now, lng)

    if now < sunrise:
        theme, next_at = "dark", sunrise
    elif now < sunset:
        theme, next_at = "light", sunset
    else:
        theme = "dark"
        try:
            next_at, _ = _fetch(lat, lng, now.date() + timedelta(days=1))
        except ServiceUnavailableError:
            next_at = None

    return {
        "effective_theme": theme,
        "sunrise": sunrise.isoformat(),
        "sunset": sunset.isoformat(),
        "next_transition_at": next_at.isoformat() if next_at else None,
    }
