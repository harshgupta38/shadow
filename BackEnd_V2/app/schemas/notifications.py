from datetime import datetime

from app.schemas.common import ORMModel


class NotificationResponse(ORMModel):
    id: int
    title: str
    body: str | None
    type: str
    read: bool
    url: str | None
    created_at: datetime
