"""Repetitive task schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import RepetitiveTaskPriority, RepetitiveTaskStatus
from app.schemas.common import ORMModel

RepetitiveTaskFrequency = Literal[
    "daily",
    "weekly",
    "monthly",
    "weekdays",
    "weekends",
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "first_of_month",
    "end_of_month",
]


class RepetitiveTaskCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    frequencies: list[RepetitiveTaskFrequency] = Field(min_length=1, max_length=14)
    priority: RepetitiveTaskPriority = RepetitiveTaskPriority.medium
    linked_goal_ids: list[int] = Field(default_factory=list)
    linked_metric_ids: list[int] = Field(default_factory=list)


class RepetitiveTaskUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    frequencies: list[RepetitiveTaskFrequency] | None = Field(
        default=None,
        min_length=1,
        max_length=14,
    )
    priority: RepetitiveTaskPriority | None = None
    status: RepetitiveTaskStatus | None = None
    linked_goal_ids: list[int] | None = None
    linked_metric_ids: list[int] | None = None


class RepetitiveTaskRead(ORMModel):
    id: int
    name: str
    description: str | None
    frequencies: list[RepetitiveTaskFrequency]
    priority: RepetitiveTaskPriority
    status: RepetitiveTaskStatus
    linked_goal_ids: list[int] = Field(default_factory=list)
    linked_metric_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class RepetitiveTaskRecommendationRead(BaseModel):
    name: str
    description: str
    frequencies: list[RepetitiveTaskFrequency]
    priority: RepetitiveTaskPriority
    rationale: str
    linked_goal_ids: list[int] = Field(default_factory=list)
    linked_metric_ids: list[int] = Field(default_factory=list)
