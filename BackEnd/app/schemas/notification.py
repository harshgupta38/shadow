"""Notification schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import NotificationType
from app.schemas.common import ORMModel


class NotificationRead(ORMModel):
    id: int
    title: str
    body: str | None
    type: NotificationType
    related_goal_id: int | None
    scheduled_at: datetime | None
    sent: bool
    read: bool
    created_at: datetime


class NotificationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str | None = None
    type: NotificationType = NotificationType.reminder
    related_goal_id: int | None = None
    scheduled_at: datetime | None = None


class PushPublicKeyRead(BaseModel):
    configured: bool
    public_key: str | None = None


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscriptionUpsert(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1024)
    keys: PushSubscriptionKeys


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=1, max_length=1024)


class DeviceConnectedAlertRequest(BaseModel):
    connected_endpoint: str | None = Field(default=None, min_length=1, max_length=1024)
