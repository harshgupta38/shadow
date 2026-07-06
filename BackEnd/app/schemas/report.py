"""Report schemas."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

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
