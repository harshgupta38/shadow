from datetime import date

from pydantic import BaseModel


class DayReport(BaseModel):
    date: date
    score: int
    habits_total: int
    habits_done: int
    tasks_total: int
    tasks_done: int


class MonthlyReportResponse(BaseModel):
    days: list[DayReport]
