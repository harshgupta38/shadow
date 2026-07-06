"""Tracked-metric schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import MetricType, MetricUnit
from app.schemas.common import ORMModel


class MetricCreate(BaseModel):
    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=128)
    unit: MetricUnit = MetricUnit.count
    target: int | None = Field(default=None, ge=0)


class MetricUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=128)
    unit: MetricUnit | None = None
    target: int | None = Field(default=None, ge=0)
    active: bool | None = None


class MetricRead(ORMModel):
    id: int
    key: str
    label: str
    unit: MetricUnit
    type: MetricType
    target: int | None
    active: bool
    created_at: datetime


class ProgressCoachRecommendationRead(BaseModel):
    id: int
    habit_id: int
    habit_name: str
    metric_name: str
    metric_key: str
    unit: MetricUnit
    target: int
    unit_hint: str | None = None
    rationale: str
    created_at: datetime


class ProgressCoachRecommendationAcceptResponse(BaseModel):
    recommendation_id: int
    habit_id: int
    metric: MetricRead
