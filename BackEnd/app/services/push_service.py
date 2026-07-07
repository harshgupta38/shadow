"""Web Push subscription management and delivery."""

from __future__ import annotations

import base64
import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.constant import settings
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services import settings_service

logger = logging.getLogger(__name__)

# Endpoints returning these status codes are considered stale/invalid for
# future sends and should be pruned from DB.
STALE_SUBSCRIPTION_STATUS_CODES = {404, 410}

try:  # pragma: no cover - import behavior depends on runtime environment
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover - graceful fallback when dependency missing
    WebPushException = Exception  # type: ignore[assignment]
    webpush = None  # type: ignore[assignment]


def _with_base64_padding(value: str) -> str:
    return value + ("=" * ((4 - (len(value) % 4)) % 4))


def _to_base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _decode_base64_any(value: str) -> bytes | None:
    normalized = value.strip()
    if not normalized:
        return None

    try:
        return base64.urlsafe_b64decode(_with_base64_padding(normalized))
    except Exception:
        pass

    try:
        return base64.b64decode(_with_base64_padding(normalized), validate=False)
    except Exception:
        return None


def _response_text_or_none(response: object | None) -> str | None:
    if response is None:
        return None
    try:
        text = getattr(response, "text", None)
        if text is None:
            return None
        if callable(text):
            text = text()
        if isinstance(text, bytes):
            text = text.decode("utf-8", errors="replace")
        return str(text)
    except Exception:
        return None


def _normalize_public_key_for_browser(raw_key: str) -> str:
    value = raw_key.strip()
    if not value:
        return ""

    decoded = _decode_base64_any(value)
    if decoded:
        # Already an uncompressed P-256 point for PushManager.
        if len(decoded) == 65 and decoded[0] == 0x04:
            return _to_base64url(decoded)

        # Support SubjectPublicKeyInfo DER keys by converting to uncompressed point.
        try:
            parsed = serialization.load_der_public_key(decoded)
            if isinstance(parsed, ec.EllipticCurvePublicKey):
                point = parsed.public_bytes(
                    encoding=serialization.Encoding.X962,
                    format=serialization.PublicFormat.UncompressedPoint,
                )
                return _to_base64url(point)
        except Exception:
            pass

    if "BEGIN PUBLIC KEY" in value:
        try:
            parsed = serialization.load_pem_public_key(value.encode("utf-8"))
            if isinstance(parsed, ec.EllipticCurvePublicKey):
                point = parsed.public_bytes(
                    encoding=serialization.Encoding.X962,
                    format=serialization.PublicFormat.UncompressedPoint,
                )
                return _to_base64url(point)
        except Exception:
            pass

    return value


def _is_vapid_configured() -> bool:
    public_key = _normalize_public_key_for_browser(settings.web_push_vapid_public_key)
    return bool(
        public_key
        and settings.web_push_vapid_private_key.strip()
        and settings.web_push_vapid_subject.strip()
    )


def get_public_key_payload() -> dict[str, bool | str | None]:
    public_key = _normalize_public_key_for_browser(settings.web_push_vapid_public_key)
    configured = bool(
        public_key
        and settings.web_push_vapid_private_key.strip()
        and settings.web_push_vapid_subject.strip()
    )
    return {
        "configured": configured,
        "public_key": public_key or None,
    }


def upsert_subscription(
    db: Session,
    user: User,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None = None,
) -> PushSubscription:
    existing = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if existing is None:
        existing = PushSubscription(
            user_id=user.id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
        )
        db.add(existing)
    else:
        existing.user_id = user.id
        existing.p256dh = p256dh
        existing.auth = auth
        existing.user_agent = user_agent

    db.commit()
    db.refresh(existing)
    return existing


def remove_subscription(db: Session, user: User, *, endpoint: str) -> None:
    row = db.scalar(
        select(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == endpoint,
        )
    )
    if row is None:
        return
    db.delete(row)
    db.commit()


def send_push_to_user(
    db: Session,
    user: User,
    *,
    title: str,
    body: str,
    url: str = "/notifications",
) -> int:
    if webpush is None:
        return 0
    if not _is_vapid_configured():
        return 0

    user_settings = settings_service.get_user_settings_row(db, user)
    if not user_settings.notifications_enabled or not user_settings.push_notifications_enabled:
        return 0

    subscriptions = list(
        db.scalars(select(PushSubscription).where(PushSubscription.user_id == user.id))
    )
    if not subscriptions:
        return 0

    payload = json.dumps(
        {
            "title": title,
            "body": body,
            "url": url,
        }
    )
    stale_subscriptions: list[PushSubscription] = []
    sent = 0

    for subscription in subscriptions:
        # pywebpush mutates claims (for example adds `aud`); use a fresh dict
        # per endpoint to avoid cross-provider JWT contamination.
        vapid_claims = {"sub": settings.web_push_vapid_subject.strip()}
        subscription_info = {
            "endpoint": subscription.endpoint,
            "keys": {
                "p256dh": subscription.p256dh,
                "auth": subscription.auth,
            },
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=settings.web_push_vapid_private_key.strip(),
                vapid_claims=vapid_claims,
                ttl=settings.web_push_ttl_seconds,
            )
            sent += 1
        except WebPushException as exc:  # pragma: no cover - network dependent
            response = getattr(exc, "response", None)
            status_code = getattr(response, "status_code", None)
            if status_code in STALE_SUBSCRIPTION_STATUS_CODES:
                stale_subscriptions.append(subscription)
                continue

            response_text = _response_text_or_none(response)
            logger.warning(
                "Web push delivery failed for user_id=%s endpoint=%s status=%s body=%s",
                user.id,
                subscription.endpoint,
                status_code,
                response_text or str(exc),
            )

    if stale_subscriptions:
        for stale in stale_subscriptions:
            db.delete(stale)
        db.commit()

    return sent
