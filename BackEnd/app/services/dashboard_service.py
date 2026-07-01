"""Dashboard aggregation — one call powers the home screen."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models.enums import GoalStatus, PlannedTaskStatus
from app.models.user import User
from app.services import (
    goal_service,
    metric_service,
    notification_service,
    plan_service,
)


def build_summary(db: Session, user: User) -> dict:
    goals = goal_service.list_goals(db, user)
    goals_total = len(goals)
    goals_active = sum(1 for g in goals if g.status == GoalStatus.active)
    goals_completed = sum(1 for g in goals if g.status == GoalStatus.completed)
    average_progress = (
        round(sum(g.progress for g in goals) / goals_total, 1) if goals_total else 0.0
    )
    active_goals = [g for g in goals if g.status == GoalStatus.active][:5]

    today = date.today()
    today_tasks = plan_service.list_tasks(db, user, on_date=today)
    tasks_today_total = len(today_tasks)
    tasks_today_done = sum(1 for t in today_tasks if t.status == PlannedTaskStatus.done)

    metrics = [
        metric_service.metric_summary(db, metric)
        for metric in metric_service.list_metrics(db, user)
    ]

    return {
        "goals_total": goals_total,
        "goals_active": goals_active,
        "goals_completed": goals_completed,
        "average_progress": average_progress,
        "tasks_today_total": tasks_today_total,
        "tasks_today_done": tasks_today_done,
        "active_goals": active_goals,
        "metrics": metrics,
        "upcoming_tasks": plan_service.upcoming_tasks(db, user, limit=5),
        "unread_notifications": notification_service.list_notifications(
            db, user, unread_only=True
        ),
    }
