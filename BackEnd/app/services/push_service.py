"""Web Push subscription management and delivery."""

from __future__ import annotations

import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constant import settings
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services import settings_service

logger = logging.getLogger(__name__)

try:  # pragma: no cover - import behavior depends on runtime environment
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover - graceful fallback when dependency missing
    WebPushException = Exception  # type: ignore[assignment]
    webpush = None  # type: ignore[assignment]


def _is_vapid_configured() -> bool:
    return bool(
        settings.web_push_vapid_public_key.strip()
        and settings.web_push_vapid_private_key.strip()
        and settings.web_push_vapid_subject.strip()
    )


def get_public_key_payload() -> dict[str, bool | str | None]:
    configured = _is_vapid_configured()
    return {
        "configured": configured,
        "public_key": settings.web_push_vapid_public_key.strip() or None,
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
    vapid_claims = {"sub": settings.web_push_vapid_subject.strip()}
    stale_subscriptions: list[PushSubscription] = []
    sent = 0

    for subscription in subscriptions:
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
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                stale_subscriptions.append(subscription)
                continue
            logger.warning(
                "Web push delivery failed for user_id=%s endpoint=%s status=%s",
                user.id,
                subscription.endpoint,
                status_code,
            )

    if stale_subscriptions:
        for stale in stale_subscriptions:
            db.delete(stale)
        db.commit()

    return sent
