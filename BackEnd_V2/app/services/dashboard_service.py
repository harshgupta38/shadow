"""Dashboard service — assembles the single-endpoint payload for the Dashboard page.

Every widget's data is a slice of one response. This module does no querying of its
own beyond what's needed to shape that response; it purely orchestrates the existing
planner/report/reports/goals/schedule/track-progress services.
"""

from sqlalchemy.orm import Session

from app.common import today_ist
from app.models.user import UserDBM
from app.schemas.dashboard import (
    DashboardResponse,
    DashboardTodayItemResponse,
    DashboardUpcomingItemResponse,
    WeeklyMatrixRowResponse,
)
from app.services import goals_service, planner_service, report_service, reports_service, schedule_service, track_progress_service

UPCOMING_WINDOW_DAYS = 60
UPCOMING_LIMIT = 7


def get_dashboard(db: Session, current_user: UserDBM) -> DashboardResponse:
    today = today_ist()

    plan = planner_service.get_plans_for_date(db, current_user, today)
    today_items = [
        DashboardTodayItemResponse(
            plan_id=item.plan_id,
            source_type=item.source_type,
            title=item.title,
            planner_type=item.planner_type,
            planner_target=item.planner_target,
            value_unit=item.value_unit,
            priority=item.priority,
            preferred_time=item.preferred_time,
            specific_time=item.specific_time,
            goal_summary=item.goal.summary if item.goal else None,
            status="done" if item.saved_data and item.saved_data.status == "done" else "due",
            current_value=item.saved_data.current_value if item.saved_data else 0,
            current_streak=item.saved_data.current_streak if item.saved_data else 0,
        )
        for item in plan.items
    ]

    latest_report_row = report_service.get_latest_report(db, current_user.id)
    latest_report = report_service.to_report_response(latest_report_row) if latest_report_row else None

    month_report = reports_service.get_monthly_report(db, current_user, today.year, today.month)

    goals = goals_service.get_goal_list(db, current_user, "Active")

    upcoming_tasks = schedule_service.get_upcoming(db, current_user, days=UPCOMING_WINDOW_DAYS)[:UPCOMING_LIMIT]
    upcoming = [
        DashboardUpcomingItemResponse(
            id=t.id,
            repeat_yearly=t.repeat_yearly,
            title=t.title,
            scheduled_date=t.scheduled_date,
            priority=t.priority,
            note=t.note,
        )
        for t in upcoming_tasks
    ]

    habits = track_progress_service.get_habits_with_history(db, current_user, today=today)
    week_habits = [
        WeeklyMatrixRowResponse(id=h.id, title=h.title, week=h.week_done)
        for h in habits
    ]

    return DashboardResponse(
        today_items=today_items,
        latest_report=latest_report,
        month_days=month_report.days,
        goals=goals,
        upcoming=upcoming,
        week_habits=week_habits,
    )
