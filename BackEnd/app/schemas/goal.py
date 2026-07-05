"""Goal schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import GoalStatus, RepetitiveTaskPriority, RepetitiveTaskStatus
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


class GoalLinkedRepetitiveTaskRead(BaseModel):
    id: int
    name: str
    description: str | None
    category: str | None = Field(default=None, max_length=64)
    priority: RepetitiveTaskPriority
    status: RepetitiveTaskStatus
    current_streak_days: int = Field(default=0, ge=0)
    max_streak_days: int = Field(default=0, ge=0)


class GoalSuggestion(BaseModel):
    """AI-suggested goal title (often phrased as a guiding question)."""

    title: str


class GoalDraftRequest(BaseModel):
    """Natural-language goal prompt used for Shadow-assisted setup."""

    prompt: str = Field(min_length=3, max_length=1200)


class GoalDraftRead(BaseModel):
    """Structured goal fields extracted by AI from a free-text prompt."""

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=64)
    target_date: datetime | None = None
