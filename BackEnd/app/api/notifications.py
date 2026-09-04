"""Notification routes."""

from __future__ import annotations

from datetime import datetime
import ipaddress
import re
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.constant import settings
from app.models.enums import NotificationType
from app.models.push_subscription import PushSubscription
from app.schemas.notification import (
    DeviceConnectedAlertRequest,
    NotificationCreate,
    NotificationRead,
    PushPublicKeyRead,
    PushSubscriptionDelete,
    PushSubscriptionUpsert,
)
from app.services import email_notification_service, notification_service, push_service
from app.services.exceptions import ConflictError

router = APIRouter(prefix="/notifications", tags=["notifications"])


_IST_ZONE = ZoneInfo("Asia/Kolkata")


def _extract_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_hop = forwarded_for.split(",", 1)[0].strip()
        if first_hop:
            return first_hop

    for header_name in ("cf-connecting-ip", "x-real-ip"):
        value = request.headers.get(header_name)
        if value:
            return value.strip()

    if request.client and request.client.host:
        return request.client.host
    return None


def _extract_location(request: Request) -> str | None:
    city = request.headers.get("cf-ipcity") or request.headers.get("x-vercel-ip-city")
    region = request.headers.get("cf-region") or request.headers.get("x-vercel-ip-country-region")
    country = request.headers.get("cf-ipcountry") or request.headers.get("x-vercel-ip-country")

    parts = [value.strip() for value in (city, region, country) if value and value.strip()]
    if parts:
        return ", ".join(parts)
    return None


def _is_public_ip(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


def _lookup_location_from_ip(ip_address: str) -> str | None:
    if not settings.ip_geolocation_enabled:
        return None
    if not _is_public_ip(ip_address):
        return None

    try:
        endpoint = settings.ip_geolocation_base_url.format(ip=ip_address)
    except Exception:
        return None

    try:
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
    if parts:
        return ", ".join(parts)
    return None


def _extract_browser(user_agent: str) -> str:
    browser_patterns = (
        ("Edg/", "Microsoft Edge"),
        ("OPR/", "Opera"),
        ("Chrome/", "Google Chrome"),
        ("Firefox/", "Mozilla Firefox"),
        ("Version/", "Safari"),
    )
    for token, name in browser_patterns:
        if token in user_agent:
            match = re.search(rf"{re.escape(token)}([\d\.]+)", user_agent)
            if match:
                return f"{name} {match.group(1)}"
            return name
    return "Unknown browser"


def _extract_operating_system(user_agent: str) -> str:
    windows_versions = {
        "10.0": "Windows 10/11",
        "6.3": "Windows 8.1",
        "6.2": "Windows 8",
        "6.1": "Windows 7",
    }
    win_match = re.search(r"Windows NT ([\d\.]+)", user_agent)
    if win_match:
        return windows_versions.get(win_match.group(1), f"Windows NT {win_match.group(1)}")

    ios_match = re.search(r"(?:iPhone|CPU iPhone|iPad).*OS ([\d_]+)", user_agent)
    if ios_match:
        return f"iOS {ios_match.group(1).replace('_', '.')}"

    android_match = re.search(r"Android ([\d\.]+)", user_agent)
    if android_match:
        return f"Android {android_match.group(1)}"

    mac_match = re.search(r"Mac OS X ([\d_]+)", user_agent)
    if mac_match:
        return f"macOS {mac_match.group(1).replace('_', '.')}"

    if "Linux" in user_agent:
        return "Linux"
    return "Unknown OS"


def _extract_device_label(user_agent: str) -> str:
    lowered = user_agent.lower()
    if "iphone" in lowered:
        return "iPhone"
    if "ipad" in lowered:
        return "iPad"
    if "android" in lowered and "mobile" in lowered:
        return "Android Phone"
    if "android" in lowered:
        return "Android Device"
    if "macintosh" in lowered or "mac os x" in lowered:
        return "Mac"
    if "windows" in lowered:
        return "Windows PC"
    if "linux" in lowered:
        return "Linux Device"
    return "Current browser session"


def _derive_device_context(user_agent: str | None, request: Request) -> dict[str, str]:
    ua = (user_agent or "").strip()
    ip_address = _extract_client_ip(request) or "Unavailable"
    location = _extract_location(request)
    if not location and ip_address != "Unavailable":
        location = _lookup_location_from_ip(ip_address)
    location = location or "Unknown location"
    detected_at = datetime.now(_IST_ZONE).strftime("%b %d, %Y - %I:%M %p IST")

    if not ua:
        return {
            "device_label": "Current browser session",
            "browser": "Unknown browser",
            "operating_system": "Unknown OS",
            "location": location,
            "detected_at": detected_at,
            "ip_address": ip_address,
        }

    return {
        "device_label": _extract_device_label(ua),
        "browser": _extract_browser(ua),
        "operating_system": _extract_operating_system(ua),
        "location": location,
        "detected_at": detected_at,
        "ip_address": ip_address,
    }


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    db: DbSession, current_user: CurrentUser, unread_only: bool = False
) -> list[NotificationRead]:
    return notification_service.list_notifications(db, current_user, unread_only=unread_only)


@router.post("", response_model=NotificationRead, status_code=status.HTTP_201_CREATED)
def create_notification(
    data: NotificationCreate, db: DbSession, current_user: CurrentUser
) -> NotificationRead:
    return notification_service.create_notification(db, current_user, data)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: int, db: DbSession, current_user: CurrentUser) -> NotificationRead:
    return notification_service.mark_read(db, current_user, notification_id)


@router.get("/push/public-key", response_model=PushPublicKeyRead)
def get_push_public_key() -> PushPublicKeyRead:
    return PushPublicKeyRead(**push_service.get_public_key_payload())


@router.post("/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def register_push_subscription(
    payload: PushSubscriptionUpsert,
    db: DbSession,
    current_user: CurrentUser,
    request: Request,
) -> Response:
    push_service.upsert_subscription(
        db,
        current_user,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=request.headers.get("user-agent"),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def remove_push_subscription(
    payload: PushSubscriptionDelete,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    push_service.remove_subscription(db, current_user, endpoint=payload.endpoint)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/push/device-connected-alert", status_code=status.HTTP_204_NO_CONTENT)
def notify_device_connected_alert(
    payload: DeviceConnectedAlertRequest,
    db: DbSession,
    current_user: CurrentUser,
    request: Request,
) -> Response:
    title = "New device connected"
    body = "A new device has been connected to your account for push notifications."

    try:
        notification_service.create_notification(
            db,
            current_user,
            NotificationCreate(title=title, body=body, type=NotificationType.system),
        )
    except ConflictError:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    exclude_endpoints = (
        {payload.connected_endpoint} if payload.connected_endpoint else None
    )
    push_service.send_push_to_user(
        db,
        current_user,
        title=title,
        body=body,
        url="/notifications",
        exclude_endpoints=exclude_endpoints,
        ignore_push_enabled=True,
    )

    subscription_user_agent: str | None = None
    if payload.connected_endpoint:
        subscription_row = db.scalar(
            select(PushSubscription).where(
                PushSubscription.user_id == current_user.id,
                PushSubscription.endpoint == payload.connected_endpoint,
            )
        )
        if subscription_row is not None:
            subscription_user_agent = subscription_row.user_agent

    email_context = _derive_device_context(
        subscription_user_agent or request.headers.get("user-agent"),
        request,
    )
    email_context["cta_label"] = "Secure My Account"

    email_notification_service.send_notification_email(
        db,
        current_user,
        template_key="new_device_alert",
        context=email_context,
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
