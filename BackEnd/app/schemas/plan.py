"""Planned-task schemas."""

from __future__ import annotations

import datetime

from pydantic import BaseModel, Field

from app.models.enums import PlannedTaskStatus
from app.schemas.common import ORMModel


class PlannedTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    date: datetime.date | None = None  # defaults to today (server-side)
    related_goal_id: int | None = None


class PlannedTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: PlannedTaskStatus | None = None
    related_goal_id: int | None = None


class PlannedTaskRead(ORMModel):
    id: int
    title: str
    date: datetime.date
    status: PlannedTaskStatus
    related_goal_id: int | None
    completed_at: datetime.datetime | None
    created_at: datetime.datetime
