"""Notification routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.notification import NotificationCreate, NotificationRead
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


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
