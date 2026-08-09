from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

MilestoneStatus = Literal[
    "Not Started",
    "In Progress",
    "Paused",
    "Completed",
    "Cancelled",
]
MilestoneCreatedBy = Literal["User", "Assistant"]


class MilestoneCreateRequest(BaseModel):
    goal_id: int
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    reason: str | None = Field(default=None, max_length=2000)
    estimated_duration_days: int | None = Field(default=None, gt=0)
    created_by: MilestoneCreatedBy = "User"
    assistant_context: dict[str, Any] | None = None


class MilestoneUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    status: MilestoneStatus | None = None
    reason: str | None = Field(default=None, max_length=2000)
    estimated_duration_days: int | None = Field(default=None, gt=0)
    target_date: date | None = None
    order: int | None = Field(default=None, ge=0)
    assistant_context: dict[str, Any] | None = None


class MilestoneResponse(BaseModel):
    id: int
    goal_id: int
    title: str
    description: str | None
    status: MilestoneStatus

    reason: str | None
    estimated_duration_days: int | None

    started_at: datetime | None
    paused_at: datetime | None
    target_date: date | None
    completed_at: datetime | None

    order: int
    created_at: datetime
    created_by: MilestoneCreatedBy
    assistant_context: dict[str, Any] | None

    total_tasks: int
    completed_tasks: int
