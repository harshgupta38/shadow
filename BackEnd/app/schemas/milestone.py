"""Milestone schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import MilestoneStatus
from app.schemas.common import ORMModel


class MilestoneCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: MilestoneStatus = MilestoneStatus.todo
    order: int = 0
    due_date: datetime | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: MilestoneStatus | None = None
    order: int | None = None
    due_date: datetime | None = None


class MilestoneRead(ORMModel):
    id: int
    goal_id: int
    title: str
    description: str | None
    status: MilestoneStatus
    order: int
    due_date: datetime | None
    completed_at: datetime | None
    created_at: datetime
