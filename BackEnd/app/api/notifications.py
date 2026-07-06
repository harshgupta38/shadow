"""Notification routes."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.notification import (
    NotificationCreate,
    NotificationRead,
    PushPublicKeyRead,
    PushSubscriptionDelete,
    PushSubscriptionUpsert,
)
from app.services import notification_service, push_service

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
