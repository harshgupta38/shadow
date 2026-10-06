import json
import logging
from datetime import time

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.common import now_ist
from app.core.config import settings
from app.models.push_subscription import PushSubscriptionDBM
from app.models.user import UserDBM
from app.services import settings_service

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


# ─── Quiet hours ──────────────────────────────────────────────────────────────

def _parse_hhmm(value: str) -> time | None:
    try:
        h, m = map(int, value.split(":"))
        if 0 <= h <= 23 and 0 <= m <= 59:
            return time(h, m)
    except (ValueError, AttributeError):
        pass
    return None


def _in_quiet_window(start: str, end: str) -> bool:
    start_t = _parse_hhmm(start)
    end_t = _parse_hhmm(end)
    if start_t is None or end_t is None or start_t == end_t:
        return False
    now = now_ist().time()
    if start_t < end_t:
        return start_t <= now < end_t
    return now >= start_t or now < end_t  # window wraps past midnight


def _quiet_hours_block(db: Session, user_id: int, is_urgent: bool) -> bool:
    """Returns True if push delivery should be suppressed right now."""
    prefs = settings_service.get_quiet_hours(db, user_id)
    if not prefs["enabled"]:
        return False
    if not _in_quiet_window(prefs["start"], prefs["end"]):
        return False
    return not (is_urgent and prefs["allow_urgent"])


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
    is_urgent: bool = False,
) -> None:
    """Send a push notification to all active subscriptions for a user.

    Suppressed entirely during the user's quiet hours, unless is_urgent=True
    and the user has opted to allow urgent notifications through.
    """
    if _quiet_hours_block(db, user_id, is_urgent):
        return

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
