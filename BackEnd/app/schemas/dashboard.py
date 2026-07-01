"""Dashboard aggregate schema."""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.goal import GoalRead
from app.schemas.notification import NotificationRead
from app.schemas.plan import PlannedTaskRead


class MetricSummary(BaseModel):
    metric_id: int
    key: str
    label: str
    unit: str
    today_total: float
    week_total: float
    target: int | None
    streak_days: int


class DashboardSummary(BaseModel):
    goals_total: int
    goals_active: int
    goals_completed: int
    average_progress: float
    tasks_today_total: int
    tasks_today_done: int
    active_goals: list[GoalRead]
    metrics: list[MetricSummary]
    upcoming_tasks: list[PlannedTaskRead]
    unread_notifications: list[NotificationRead]
