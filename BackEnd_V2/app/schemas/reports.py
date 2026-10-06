from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class DayReport(BaseModel):
    date: date
    score: int | None
    alignment_score: int | None
    habits_total: int
    habits_done: int
    tasks_total: int
    tasks_done: int
    schedule_total: int
    schedule_done: int
    has_daily_report: bool
    has_weekly_report: bool


class MonthlyReportResponse(BaseModel):
    days: list[DayReport]
