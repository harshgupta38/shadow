from sqlalchemy.orm import Session

from app.models.notification import NotificationDBM
from app.models.user import UserDBM
from app.core.exceptions import NotFoundError


def create_notification(
    db: Session,
    user: UserDBM,
    *,
    title: str,
    body: str | None = None,
    type: str = "system",
    url: str | None = None,
) -> NotificationDBM:
    """
    One function to create and persist a notification for a user.
    Commits immediately so SSE polling picks it up in the next tick.
    """
    notif = NotificationDBM(
        user_id=user.id,
        title=title,
        body=body,
        type=type,
        url=url,
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
    ).update({"read": True})
    db.commit()
