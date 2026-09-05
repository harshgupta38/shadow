import json
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

from app.core.exceptions import ServiceUnavailableError

_API = "https://api.sunrise-sunset.org/json"


def _fetch(lat: float, lng: float, d: date) -> tuple[datetime, datetime]:
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
        return datetime.fromisoformat(r["sunrise"]), datetime.fromisoformat(r["sunset"])
    except (KeyError, ValueError) as exc:
        raise ServiceUnavailableError("Unexpected response format from sunrise-sunset.org.") from exc


def resolve_dynamic_theme(lat: float, lng: float) -> dict:
    now = datetime.now(tz=timezone.utc)
    sunrise, sunset = _fetch(lat, lng, now.date())

    if now < sunrise:
        theme, next_at = "dark", sunrise
    elif now < sunset:
        theme, next_at = "light", sunset
    else:
        theme = "dark"
        next_at, _ = _fetch(lat, lng, now.date() + timedelta(days=1))

    return {
        "effective_theme": theme,
        "sunrise": sunrise.isoformat(),
        "sunset": sunset.isoformat(),
        "next_transition_at": next_at.isoformat(),
    }
