import json
import logging

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.push_subscription import PushSubscriptionDBM
from app.models.user import UserDBM

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def get_public_key() -> str | None:
    return settings.vapid_public_key or None


def save_subscription(
    db: Session,
    user: UserDBM,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
) -> PushSubscriptionDBM:
    existing = db.scalar(
        select(PushSubscriptionDBM).where(PushSubscriptionDBM.endpoint == endpoint)
    )
    if existing:
        existing.user_id = user.id
        existing.p256dh = p256dh
        existing.auth = auth
        existing.user_agent = user_agent
        db.commit()
        db.refresh(existing)
        return existing

    sub = PushSubscriptionDBM(
        user_id=user.id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=user_agent,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def remove_subscription(db: Session, user: UserDBM, endpoint: str) -> None:
    db.execute(
        delete(PushSubscriptionDBM).where(
            PushSubscriptionDBM.user_id == user.id,
            PushSubscriptionDBM.endpoint == endpoint,
        )
    )
    db.commit()


def get_user_subscriptions(db: Session, user_id: int) -> list[PushSubscriptionDBM]:
    return list(
        db.scalars(
            select(PushSubscriptionDBM).where(PushSubscriptionDBM.user_id == user_id)
        ).all()
    )


def send_push(
    endpoint: str,
    p256dh: str,
    auth: str,
    title: str,
    body: str,
    url: str = "/",
) -> bool:
    """Send a Web Push notification. Returns True on success, False on failure.
    Stale/expired subscriptions should be deleted by the caller on False."""
    if not _is_configured():
        logger.debug("VAPID keys not configured — push skipped")
        return False

    try:
        from pywebpush import webpush, WebPushException  # type: ignore[import-untyped]

        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=120,
        )
        return True
    except Exception as exc:
        # pywebpush raises WebPushException; HTTP 404/410 means subscription gone
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            logger.info("Stale push endpoint removed: %s", endpoint[:60])
        else:
            logger.warning("Push send failed: %s", exc)
        return False


def send_push_to_user(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    url: str = "/",
    exclude_endpoint: str | None = None,
) -> None:
    """Send a push notification to all active subscriptions for a user."""
    subs = get_user_subscriptions(db, user_id)
    stale: list[str] = []
    for sub in subs:
        if exclude_endpoint and sub.endpoint == exclude_endpoint:
            continue
        ok = send_push(sub.endpoint, sub.p256dh, sub.auth, title, body, url)
        if not ok:
            stale.append(sub.endpoint)
    for ep in stale:
        db.execute(
            delete(PushSubscriptionDBM).where(PushSubscriptionDBM.endpoint == ep)
        )
    if stale:
        db.commit()
