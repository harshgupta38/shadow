"""Planned-task schemas."""

from __future__ import annotations

import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import (
    MetricTimeSpan,
    PlannedTaskPriority,
    PlannedTaskSource,
    PlannedTaskStatus,
)
from app.schemas.common import ORMModel


class PlannedTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    date: datetime.date | None = None  # defaults to today (server-side)
    related_goal_id: int | None = None
    reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    estimated_duration_minutes: int | None = Field(default=None, ge=5, le=360)
    source: PlannedTaskSource | None = None
    priority: PlannedTaskPriority | None = None
    ai_rationale: str | None = Field(default=None, max_length=2000)
    ai_impact_if_skipped: str | None = Field(default=None, max_length=2000)
    ai_confidence_score: int | None = Field(default=None, ge=0, le=100)
    suggested_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    suggested_finish_by_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    execution_order: int | None = Field(default=None, ge=1, le=500)
    carried_from_date: datetime.date | None = None
    generated_at: datetime.datetime | None = None


class PlannedTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: PlannedTaskStatus | None = None
    related_goal_id: int | None = None
    reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    estimated_duration_minutes: int | None = Field(default=None, ge=5, le=360)
    source: PlannedTaskSource | None = None
    priority: PlannedTaskPriority | None = None
    ai_rationale: str | None = Field(default=None, max_length=2000)
    ai_impact_if_skipped: str | None = Field(default=None, max_length=2000)
    ai_confidence_score: int | None = Field(default=None, ge=0, le=100)
    suggested_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    suggested_finish_by_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    execution_order: int | None = Field(default=None, ge=1, le=500)
    carried_from_date: datetime.date | None = None
    generated_at: datetime.datetime | None = None


class PlannedTaskRead(ORMModel):
    id: int
    title: str
    date: datetime.date
    reminder_time: str | None
    estimated_duration_minutes: int | None
    status: PlannedTaskStatus
    source: PlannedTaskSource
    priority: PlannedTaskPriority
    ai_rationale: str | None
    ai_impact_if_skipped: str | None
    ai_confidence_score: int | None
    suggested_start_time: str | None
    suggested_finish_by_time: str | None
    execution_order: int | None
    carried_from_date: datetime.date | None
    generated_at: datetime.datetime | None
    related_goal_id: int | None
    completed_at: datetime.datetime | None
    created_at: datetime.datetime


class PlanGenerateRequest(BaseModel):
    on_date: datetime.date | None = None


class PlanGeneratedTaskInput(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    related_goal_id: int | None = None
    priority: PlannedTaskPriority = PlannedTaskPriority.medium
    estimated_duration_minutes: int | None = Field(default=None, ge=5, le=360)
    suggested_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    suggested_finish_by_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    ai_rationale: str | None = Field(default=None, max_length=2000)
    ai_impact_if_skipped: str | None = Field(default=None, max_length=2000)
    ai_confidence_score: int | None = Field(default=None, ge=0, le=100)


class PlannedTaskProgressUpdate(BaseModel):
    value: float = Field(ge=0)
    mode: Literal["add", "set"] = "add"
    metric_id: int | None = Field(default=None, ge=1)
    note: str | None = Field(default=None, max_length=500)


class PlanTaskLinkedMetricRead(BaseModel):
    metric_id: int
    label: str
    unit_text: str
    target: int | None
    time_span: MetricTimeSpan
    time_span_custom_text: str | None
    logged_total: float = 0.0


class PlanWorkspaceTaskRead(PlannedTaskRead):
    category: str | None = Field(default=None, max_length=64)
    goal_title: str | None = Field(default=None, max_length=255)
    missed_yesterday: bool = False
    overdue: bool = False
    completed_late: bool = False
    repetitive_task_id: int | None = None
    linked_metrics: list[PlanTaskLinkedMetricRead] = Field(default_factory=list)
    current_habit_streak: int | None = Field(default=None, ge=0)
    previous_completion_history: str | None = Field(default=None, max_length=255)


class PlanGenerationPayload(BaseModel):
    tasks: list[PlanGeneratedTaskInput] = Field(default_factory=list, max_length=20)


class PlanExecutionItem(BaseModel):
    task_id: int
    title: str
    source: PlannedTaskSource
    priority: PlannedTaskPriority
    estimated_duration_minutes: int | None
    suggested_start_time: str | None
    suggested_finish_by_time: str | None


class PlanHabitStreakItem(BaseModel):
    task_title: str
    highest_streak_days: int = Field(default=0, ge=0)
    current_streak_days: int = Field(default=0, ge=0)
    completion_rate_percent: int = Field(default=0, ge=0, le=100)
    last_completed_days_ago: int | None = Field(default=None, ge=0)
    at_risk: bool = False


class PlanInsightsRead(BaseModel):
    missed_yesterday_count: int = 0
    missed_yesterday_titles: list[str] = Field(default_factory=list)
    carry_forward_count: int = 0
    carry_forward_titles: list[str] = Field(default_factory=list)
    highest_priority_task_title: str | None = None
    highest_priority_message: str | None = None
    estimated_tasks_count: int = 0
    estimated_workload_minutes: int = 0
    workload_label: str = "Light"
    habit_streak_summary: list[PlanHabitStreakItem] = Field(default_factory=list)


class PlanWorkspaceRead(BaseModel):
    date: datetime.date
    tasks: list[PlanWorkspaceTaskRead] = Field(default_factory=list)
    insights: PlanInsightsRead
    execution_order: list[PlanExecutionItem] = Field(default_factory=list)
    generated_at: datetime.datetime | None = None
