"""Report schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import ReportPeriod, ReportSource
from app.schemas.common import ORMModel


class ReportGenerateRequest(BaseModel):
    period: ReportPeriod = ReportPeriod.daily
    # Optional anchor date; defaults to today. Report covers the day/week
    # containing this date.
    on_date: date | None = None


class ReportRead(ORMModel):
    id: int
    period: ReportPeriod
    source: ReportSource
    period_start: datetime
    period_end: datetime
    metrics_json: dict
    narrative: str | None
    next_steps: str | None
    created_at: datetime


class ReportHistoryCardRead(BaseModel):
    history_date: date
    versions_count: int
    latest_report_id: int
    latest_period: ReportPeriod
    latest_created_at: datetime
    latest_narrative_snippet: str | None
    report_periods: list[ReportPeriod]


ReportAutomationWeekday = Literal[
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


class ReportAutomationRead(BaseModel):
    enabled: bool
    daily_enabled: bool
    daily_time: str
    weekly_enabled: bool
    weekly_day: ReportAutomationWeekday
    weekly_time: str
    include_plan_snapshot: bool
    include_goals_snapshot: bool
    include_habits_snapshot: bool
    include_metrics_snapshot: bool
    include_missed_tasks_snapshot: bool
    include_streaks_snapshot: bool
    selected_metric_ids: list[int]
    selected_habit_ids: list[int]


class ReportAutomationUpdate(BaseModel):
    enabled: bool | None = None
    daily_enabled: bool | None = None
    daily_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    weekly_enabled: bool | None = None
    weekly_day: ReportAutomationWeekday | None = None
    weekly_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    include_plan_snapshot: bool | None = None
    include_goals_snapshot: bool | None = None
    include_habits_snapshot: bool | None = None
    include_metrics_snapshot: bool | None = None
    include_missed_tasks_snapshot: bool | None = None
    include_streaks_snapshot: bool | None = None
    selected_metric_ids: list[int] | None = None
    selected_habit_ids: list[int] | None = None
