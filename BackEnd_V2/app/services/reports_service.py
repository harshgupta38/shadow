import calendar as cal_module
from datetime import date

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.models.plan_record import DailyPlanRecordDBM
from app.models.report import ReportDBM
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

    # Build a mapping of date → set of report_types present, and date → alignment_score
    # (daily score preferred over weekly; latest report wins per type)
    report_type_rows = db.execute(
        select(ReportDBM.report_date, ReportDBM.report_type, ReportDBM.alignment_score)
        .where(
            ReportDBM.user_id == user.id,
            ReportDBM.report_date >= start,
            ReportDBM.report_date <= end,
        )
        .order_by(ReportDBM.report_date, ReportDBM.id.desc())
    ).all()
    report_types_by_date: dict[date, set[str]] = {}
    daily_alignment: dict[date, int] = {}
    weekly_alignment: dict[date, int] = {}
    for rd, rt, ascore in report_type_rows:
        report_types_by_date.setdefault(rd, set()).add(rt)
        if ascore is not None:
            if rt == "daily" and rd not in daily_alignment:
                daily_alignment[rd] = ascore
            elif rt == "weekly" and rd not in weekly_alignment:
                weekly_alignment[rd] = ascore
    # daily wins over weekly when both exist
    alignment_by_date: dict[date, int] = {**weekly_alignment, **daily_alignment}

    report_dates: set[date] = set(report_types_by_date.keys())

    days: list[DayReport] = []
    seen_dates: set[date] = set()

    for row in rows:
        total = row.total or 0
        if total == 0:
            continue
        seen_dates.add(row.scheduled_date)
        types = report_types_by_date.get(row.scheduled_date, set())
        days.append(
            DayReport(
                date=row.scheduled_date,
                score=round((row.score_sum or 0) / total * 100),
                alignment_score=alignment_by_date.get(row.scheduled_date),
                habits_total=int(row.habits_total or 0),
                habits_done=int(row.habits_done or 0),
                tasks_total=int(row.tasks_total or 0),
                tasks_done=int(row.tasks_done or 0),
                schedule_total=int(row.schedule_total or 0),
                schedule_done=int(row.schedule_done or 0),
                has_daily_report="daily" in types,
                has_weekly_report="weekly" in types,
            )
        )

    # Include any dates that have a report but no plan records (score shown as null)
    for rd in sorted(report_dates - seen_dates):
        types = report_types_by_date.get(rd, set())
        days.append(
            DayReport(
                date=rd,
                score=None,
                alignment_score=alignment_by_date.get(rd),
                habits_total=0,
                habits_done=0,
                tasks_total=0,
                tasks_done=0,
                schedule_total=0,
                schedule_done=0,
                has_daily_report="daily" in types,
                has_weekly_report="weekly" in types,
            )
        )

    days.sort(key=lambda d: d.date)
    return MonthlyReportResponse(days=days)
