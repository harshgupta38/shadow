import calendar as cal_module
from datetime import date

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.models.plan_record import DailyPlanRecordDBM
from app.models.user import UserDBM
from app.schemas.reports import DayReport, MonthlyReportResponse


def get_monthly_report(
    db: Session,
    user: UserDBM,
    year: int,
    month: int,
) -> MonthlyReportResponse:
    start = date(year, month, 1)
    end = date(year, month, cal_module.monthrange(year, month)[1])

    score_contribution = case(
        (
            and_(
                DailyPlanRecordDBM.planner_type == "metric",
                DailyPlanRecordDBM.planner_target.isnot(None),
                DailyPlanRecordDBM.planner_target > 0,
            ),
            func.min(1.0, DailyPlanRecordDBM.actual_value * 1.0 / DailyPlanRecordDBM.planner_target),
        ),
        else_=case((DailyPlanRecordDBM.status == "done", 1.0), else_=0.0),
    )

    rows = db.execute(
        select(
            DailyPlanRecordDBM.scheduled_date,
            func.count(DailyPlanRecordDBM.id).label("total"),
            func.sum(score_contribution).label("score_sum"),
            func.sum(
                case((DailyPlanRecordDBM.source_type == "habit", 1), else_=0)
            ).label("habits_total"),
            func.sum(
                case(
                    (and_(DailyPlanRecordDBM.source_type == "habit", DailyPlanRecordDBM.status == "done"), 1),
                    else_=0,
                )
            ).label("habits_done"),
            func.sum(
                case((DailyPlanRecordDBM.source_type == "task", 1), else_=0)
            ).label("tasks_total"),
            func.sum(
                case(
                    (and_(DailyPlanRecordDBM.source_type == "task", DailyPlanRecordDBM.status == "done"), 1),
                    else_=0,
                )
            ).label("tasks_done"),
            func.sum(
                case((DailyPlanRecordDBM.source_type == "schedule", 1), else_=0)
            ).label("schedule_total"),
            func.sum(
                case(
                    (and_(DailyPlanRecordDBM.source_type == "schedule", DailyPlanRecordDBM.status == "done"), 1),
                    else_=0,
                )
            ).label("schedule_done"),
        )
        .where(
            and_(
                DailyPlanRecordDBM.user_id == user.id,
                DailyPlanRecordDBM.scheduled_date >= start,
                DailyPlanRecordDBM.scheduled_date <= end,
                DailyPlanRecordDBM.source_type.in_(["habit", "task", "schedule"]),
            )
        )
        .group_by(DailyPlanRecordDBM.scheduled_date)
        .order_by(DailyPlanRecordDBM.scheduled_date)
    ).all()

    days: list[DayReport] = []
    for row in rows:
        total = row.total or 0
        if total == 0:
            continue
        days.append(
            DayReport(
                date=row.scheduled_date,
                score=round((row.score_sum or 0) / total * 100),
                habits_total=int(row.habits_total or 0),
                habits_done=int(row.habits_done or 0),
                tasks_total=int(row.tasks_total or 0),
                tasks_done=int(row.tasks_done or 0),
                schedule_total=int(row.schedule_total or 0),
                schedule_done=int(row.schedule_done or 0),
            )
        )

    return MonthlyReportResponse(days=days)
