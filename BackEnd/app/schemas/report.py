"""Report schemas."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import ReportPeriod
from app.schemas.common import ORMModel


class ReportGenerateRequest(BaseModel):
    period: ReportPeriod = ReportPeriod.daily
    # Optional anchor date; defaults to today. Report covers the day/week
    # containing this date.
    on_date: date | None = None


class ReportRead(ORMModel):
    id: int
    period: ReportPeriod
    period_start: datetime
    period_end: datetime
    metrics_json: dict
    narrative: str | None
    next_steps: str | None
    created_at: datetime
