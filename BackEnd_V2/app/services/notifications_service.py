from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import NotificationDBM
from app.models.user import UserDBM
from app.core.exceptions import NotFoundError

# ── Notification level constants ──────────────────────────────────────────────
#
# Level 1 — Critical   Always delivered; ignores all user preferences.
#                       Use for: welcome, report generated/failed, security alerts.
# Level 2 — Achievement  Respects master toggle.
#                       Use for: goal/milestone completed, streak milestones.
# Level 3 — Informational  Respects master toggle.
#                       Use for: plan ready, general system info.
# Level 4 — Reminder   Respects master toggle + reminder_notifications_enabled.
#                       Use for: due-date alerts, overdue tasks, scheduled reminders.
# Level 5 — Nudge      Respects master toggle + reminder_notifications_enabled.
#                       Use for: plan completion reminder, habits not logged.

LEVEL_CRITICAL      = 1
LEVEL_ACHIEVEMENT   = 2
LEVEL_INFORMATIONAL = 3
LEVEL_REMINDER      = 4
LEVEL_NUDGE         = 5


def _get_notification_prefs(db: Session, user_id: int) -> dict:
    """Returns the stored notifications settings dict for a user, or {} if none."""
    from app.models.user_setting import UserSettingDBM
    row = db.scalar(select(UserSettingDBM).where(UserSettingDBM.user_id == user_id))
    if row is None or not row.notifications:
        return {}
    return dict(row.notifications)


def _should_notify(prefs: dict, level: int) -> bool:
    """Returns False if the user's settings block this notification level."""
    if level == LEVEL_CRITICAL:
        return True
    if not prefs.get("notifications_enabled", True):
        return False
    if level >= LEVEL_REMINDER and not prefs.get("reminder_notifications_enabled", True):
        return False
    return True


def create_notification(
    db: Session,
    user: UserDBM,
    *,
    title: str,
    body: str | None = None,
    type: str = "system",
    level: int = LEVEL_INFORMATIONAL,
    url: str | None = None,
    event_key: str | None = None,
    priority: int = 2,
) -> NotificationDBM | None:
    """
    Create and persist a notification for a user.

    Checks the user's notification preferences first — returns None without
    writing if the user's settings block this level (except level 1, which is
    always delivered).

    If event_key is supplied the row is also skipped when an identical
    (user_id, event_key) pair already exists — deduplication for event-triggered
    notifications.  Commits immediately so SSE polling picks up the new row.
    """
    prefs = _get_notification_prefs(db, user.id)
    if not _should_notify(prefs, level):
        return None

    if event_key is not None:
        existing = db.scalar(
            select(NotificationDBM).where(
                NotificationDBM.user_id == user.id,
                NotificationDBM.event_key == event_key,
            )
        )
        if existing is not None:
            return None

    notif = NotificationDBM(
        user_id=user.id,
        title=title,
        body=body,
        type=type,
        level=level,
        url=url,
        event_key=event_key,
        priority=priority,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def list_notifications(
    db: Session,
    user: UserDBM,
    *,
    unread_only: bool = False,
    limit: int = 50,
    before_id: int | None = None,
) -> list[NotificationDBM]:
    q = db.query(NotificationDBM).filter(NotificationDBM.user_id == user.id)
    if unread_only:
        q = q.filter(NotificationDBM.read == False)  # noqa: E712
    if before_id is not None:
        q = q.filter(NotificationDBM.id < before_id)
    return q.order_by(NotificationDBM.created_at.desc()).limit(limit).all()


def get_notifications_since(
    db: Session,
    user_id: int,
    since_id: int,
) -> list[NotificationDBM]:
    """Returns notifications with id > since_id, oldest first. Used by SSE polling."""
    return (
        db.query(NotificationDBM)
        .filter(NotificationDBM.user_id == user_id, NotificationDBM.id > since_id)
        .order_by(NotificationDBM.id.asc())
        .all()
    )


def get_latest_id(db: Session, user_id: int) -> int:
    """Returns the max notification id for the user, or 0 if none exist."""
    latest = (
        db.query(NotificationDBM.id)
        .filter(NotificationDBM.user_id == user_id)
        .order_by(NotificationDBM.id.desc())
        .first()
    )
    return latest[0] if latest else 0


def mark_read(db: Session, user: UserDBM, notification_id: int) -> NotificationDBM:
    notif = db.query(NotificationDBM).filter(
        NotificationDBM.id == notification_id,
        NotificationDBM.user_id == user.id,
    ).first()
    if not notif:
        raise NotFoundError("Notification not found.")
    notif.read = True
    db.commit()
    db.refresh(notif)
    return notif


def delete_notification(db: Session, user: UserDBM, notification_id: int) -> None:
    notif = db.query(NotificationDBM).filter(
        NotificationDBM.id == notification_id,
        NotificationDBM.user_id == user.id,
    ).first()
    if not notif:
        raise NotFoundError("Notification not found.")
    db.delete(notif)
    db.commit()


def mark_read_batch(db: Session, user: UserDBM, ids: list[int]) -> None:
    db.query(NotificationDBM).filter(
        NotificationDBM.user_id == user.id,
        NotificationDBM.id.in_(ids),
    ).update({"read": True}, synchronize_session=False)
    db.commit()


def mark_all_read(db: Session, user: UserDBM) -> None:
    db.query(NotificationDBM).filter(
        NotificationDBM.user_id == user.id,
        NotificationDBM.read == False,  # noqa: E712
    ).update({"read": True}, synchronize_session=False)
    db.commit()
