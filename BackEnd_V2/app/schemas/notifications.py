from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import ORMModel


class NotificationResponse(ORMModel):
    id: int
    priority: int = 2
    title: str
    body: str | None
    type: str
    level: int
    read: bool
    url: str | None
    event_key: str | None
    created_at: datetime


# ─── Push notification schemas ────────────────────────────────────────────────

class PushSubscriptionRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str | None = None


class PushPublicKeyResponse(BaseModel):
    public_key: str


class DeviceConnectedAlertRequest(BaseModel):
    endpoint: str


# ─── Daily brief schemas ──────────────────────────────────────────────────────

class DailyBriefResponse(BaseModel):
    complete_brief: str | None
    date: str
    generated_at: str | None
