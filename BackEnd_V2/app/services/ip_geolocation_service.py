"""Best-effort IP geolocation for security alert emails (failed login attempts).

Never raises and never blocks meaningfully — disabled by default
(IP_GEOLOCATION_ENABLED=false), and every failure mode (private/local IP,
disabled config, network error, malformed response) just returns None so the
caller can omit the location/map entirely.
"""
import ipaddress
import math

import httpx

from app.core.config import settings

_MAP_ZOOM = 11


def _is_public_ip(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


def lookup_geo(ip_address: str | None) -> dict | None:
    """Returns {"label": "City, Region, Country", "latitude": float, "longitude": float}
    (label and/or coordinates may be None individually), or None if the lookup
    can't be done at all (disabled, private IP, network/parse failure)."""
    if not ip_address or not settings.ip_geolocation_enabled:
        return None
    if not _is_public_ip(ip_address):
        return None

    try:
        endpoint = settings.ip_geolocation_base_url.format(ip=ip_address)
        response = httpx.get(endpoint, timeout=settings.ip_geolocation_timeout_seconds)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None

    status_value = payload.get("status")
    if status_value is not None and str(status_value).lower() not in {"success", "ok", "true"}:
        return None

    city = payload.get("city")
    region = payload.get("regionName") or payload.get("region")
    country = payload.get("country") or payload.get("country_name") or payload.get("countryCode")
    parts = [str(value).strip() for value in (city, region, country) if value and str(value).strip()]
    label = ", ".join(parts) if parts else None

    lat, lon = payload.get("lat"), payload.get("lon")
    latitude = float(lat) if isinstance(lat, (int, float)) else None
    longitude = float(lon) if isinstance(lon, (int, float)) else None

    if not label and latitude is None:
        return None
    return {"label": label, "latitude": latitude, "longitude": longitude}


def _lonlat_to_tile(latitude: float, longitude: float, zoom: int) -> tuple[int, int]:
    """Standard "slippy map" tilename conversion — which OSM tile covers this point."""
    lat_rad = math.radians(latitude)
    n = 2 ** zoom
    x = int((longitude + 180.0) / 360.0 * n)
    y = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def static_map_url(latitude: float, longitude: float) -> str:
    """A single OpenStreetMap tile covering the given coordinates — no API key,
    no third-party staticmap service (those tend to disappear/rate-limit).
    Email clients can't render interactive maps, only a plain <img>, so this
    is the area map, not a precisely-centered pin."""
    x, y = _lonlat_to_tile(latitude, longitude, _MAP_ZOOM)
    return f"https://tile.openstreetmap.org/{_MAP_ZOOM}/{x}/{y}.png"
