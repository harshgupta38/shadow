"""Goal schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import GoalStatus
from app.schemas.common import ORMModel
from app.schemas.milestone import MilestoneRead


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=64)
    target_date: datetime | None = None


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=64)
    status: GoalStatus | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    target_date: datetime | None = None


class GoalRead(ORMModel):
    id: int
    title: str
    description: str | None
    category: str | None
    status: GoalStatus
    progress: int
    target_date: datetime | None
    created_at: datetime
    updated_at: datetime
    milestones: list[MilestoneRead] = []


class GoalSuggestion(BaseModel):
    """AI-suggested goal title (often phrased as a guiding question)."""

    title: str
