from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class NotificationResponse(ORMModel):
    id: int
    title: str
    body: str | None
    type: str
    read: bool
    url: str | None
    created_at: datetime


class NotificationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str | None = None
    type: str = "system"
    url: str | None = None
