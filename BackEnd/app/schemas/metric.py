"""Tracked-metric schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import MetricTimeSpan, MetricType, MetricUnit
from app.schemas.common import ORMModel


class MetricCreate(BaseModel):
    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=128)
    unit: MetricUnit | None = None
    unit_text: str | None = Field(default=None, min_length=1, max_length=32)
    time_span: MetricTimeSpan = MetricTimeSpan.day
    time_span_custom_text: str | None = Field(default=None, min_length=1, max_length=64)
    target: int | None = Field(default=None, ge=0)
    linked_habit_ids: list[int] = Field(default_factory=list)


class MetricUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=128)
    unit: MetricUnit | None = None
    unit_text: str | None = Field(default=None, min_length=1, max_length=32)
    time_span: MetricTimeSpan | None = None
    time_span_custom_text: str | None = Field(default=None, min_length=1, max_length=64)
    target: int | None = Field(default=None, ge=0)
    linked_habit_ids: list[int] | None = None
    active: bool | None = None


class MetricRead(ORMModel):
    id: int
    key: str
    label: str
    unit: MetricUnit
    unit_text: str
    time_span: MetricTimeSpan
    time_span_custom_text: str | None
    type: MetricType
    target: int | None
    linked_habit_ids: list[int] = Field(default_factory=list)
    active: bool
    created_at: datetime


class MetricDraftRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1200)


class MetricDraftRead(BaseModel):
    label: str = Field(min_length=1, max_length=128)
    unit_text: str = Field(min_length=1, max_length=32)
    time_span: MetricTimeSpan
    time_span_custom_text: str | None = Field(default=None, max_length=64)
    target: int | None = Field(default=None, ge=0)
    rationale: str | None = None


class ProgressCoachRecommendationRead(BaseModel):
    id: int
    habit_id: int
    habit_name: str
    metric_name: str
    metric_key: str
    unit: MetricUnit
    time_span: MetricTimeSpan
    target: int
    unit_hint: str | None = None
    rationale: str
    created_at: datetime


class ProgressCoachRecommendationAcceptResponse(BaseModel):
    recommendation_id: int
    habit_id: int
    metric: MetricRead
