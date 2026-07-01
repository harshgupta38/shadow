"""Activity-log schemas."""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field

from app.models.enums import ActivitySource
from app.schemas.common import ORMModel


class ActivityLogCreate(BaseModel):
    value: float = Field(ge=0)
    date: datetime.date | None = None  # defaults to today (server-side)
    note: str | None = None


class ActivityLogRead(ORMModel):
    id: int
    metric_id: int
    date: datetime.date
    value: float
    note: str | None
    source: ActivitySource
    created_at: datetime.datetime
