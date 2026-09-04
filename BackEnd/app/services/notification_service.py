"""Notification business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationCreate
from app.services.progress_metric_recommendation_service import (
    INTERNAL_PROGRESS_COACH_TITLE_PREFIX,
)
from app.services import email_notification_service, settings_service
from app.services.exceptions import ConflictError
from app.services.utils import get_owned_or_404


def list_notifications(db: Session, user: User, *, unread_only: bool = False) -> list[Notification]:
    stmt = select(Notification).where(
        Notification.user_id == user.id,
        ~Notification.title.startswith(INTERNAL_PROGRESS_COACH_TITLE_PREFIX),
    )
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    return list(db.scalars(stmt.order_by(Notification.created_at.desc())))


def create_notification(db: Session, user: User, data: NotificationCreate) -> Notification:
    settings = settings_service.get_user_settings_row(db, user)
    if not settings.notifications_enabled:
        raise ConflictError("Notifications are currently disabled in your settings")
    if data.type == NotificationType.reminder and not settings.reminder_notifications_enabled:
        raise ConflictError("Task reminders are disabled in your notification settings")
    if (
        data.type == NotificationType.system
        and data.title.startswith("Daily Brief")
        and not settings.daily_brief_enabled
    ):
        raise ConflictError("Daily brief notifications are disabled in your settings")
    if (
        data.type == NotificationType.system
        and data.title.startswith("Weekly Summary")
        and not settings.weekly_summary_enabled
    ):
        raise ConflictError("Weekly summary notifications are disabled in your settings")

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

    if notification.scheduled_at is None:
        template_key = email_notification_service.resolve_template_key_for_notification(notification)
        if template_key is not None:
            email_notification_service.send_notification_email(
                db,
                user,
                template_key=template_key,
                context=email_notification_service.context_from_notification(notification),
            )

    return notification


def mark_read(db: Session, user: User, notification_id: int) -> Notification:
    notification = get_owned_or_404(
        db, Notification, notification_id, user.id, name="Notification"
    )
    notification.read = True
    db.commit()
    db.refresh(notification)
    return notification
