from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.daily_report import ReportResponse
from app.schemas.goals import GoalDataShortResponse
from app.schemas.planner import PlanPreferredTime, PlannerType, PlanPriority, PlanSourceType
from app.schemas.reports import DayReport
from app.schemas.schedule import ScheduledTaskPriority


class DashboardTodayItemResponse(BaseModel):
    plan_id: int
    source_type: PlanSourceType
    title: str
    planner_type: PlannerType
    planner_target: int | None
    value_unit: str | None
    priority: PlanPriority
    preferred_time: PlanPreferredTime
    specific_time: str | None
    goal_summary: str | None
    status: Literal["due", "done"]
    current_value: int
    current_streak: int


class DashboardUpcomingItemResponse(BaseModel):
    id: int
    # scheduled_tasks and yearly_tasks are separate tables with their own id
    # sequences, so an id can collide across the two — this disambiguates them
    # (matches the same repeat_yearly pattern the Schedule feature already uses).
    repeat_yearly: bool
    title: str
    scheduled_date: date
    priority: ScheduledTaskPriority
    note: str | None


class WeeklyMatrixRowResponse(BaseModel):
    id: int
    title: str
    week: list[bool]  # 7 entries ordered by user's week_starts_on preference (index 0 = first day of week)


class DashboardResponse(BaseModel):
    today_items: list[DashboardTodayItemResponse]
    latest_report: ReportResponse | None  # None when no report has ever been generated
    month_days: list[DayReport]
    goals: list[GoalDataShortResponse]
    upcoming: list[DashboardUpcomingItemResponse]
    week_habits: list[WeeklyMatrixRowResponse]
