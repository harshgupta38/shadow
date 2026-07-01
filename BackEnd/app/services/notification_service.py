"""Notification business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationCreate
from app.services.utils import get_owned_or_404


def list_notifications(db: Session, user: User, *, unread_only: bool = False) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    return list(db.scalars(stmt.order_by(Notification.created_at.desc())))


def create_notification(db: Session, user: User, data: NotificationCreate) -> Notification:
    notification = Notification(
        user_id=user.id,
        title=data.title,
        body=data.body,
        type=data.type,
        related_goal_id=data.related_goal_id,
        scheduled_at=data.scheduled_at,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


def mark_read(db: Session, user: User, notification_id: int) -> Notification:
    notification = get_owned_or_404(
        db, Notification, notification_id, user.id, name="Notification"
    )
    notification.read = True
    db.commit()
    db.refresh(notification)
    return notification
