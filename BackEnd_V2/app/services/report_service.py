import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, desc
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.llm.models import GenerateReportFromLLM
from app.llm.service import get_llm_service
from app.models.goal import GoalDBM
from app.models.habit import HabitDBM
from app.models.milestone import MilestoneDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.report import ReportDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.daily_report import ReportResponse
from app.services import notifications_service

logger = logging.getLogger(__name__)

_in_progress: set[tuple[int, date, str]] = set()


# ── Private helpers ───────────────────────────────────────────────────────────

def _record_to_dict(r: DailyPlanRecordDBM) -> dict:
    return {
        "source_type": r.source_type,
        "title": r.title,
        "status": r.status,
        "priority": r.priority,
        "planner_type": r.planner_type,
        "actual_value": r.actual_value,
        "planner_target": r.planner_target,
        "value_unit": r.value_unit,
        "duration_minutes": r.duration_minutes,
        "note": r.note,
    }


def _goal_id_for(
    r: DailyPlanRecordDBM,
    task_map: dict[int, TaskDBM],
    habit_map: dict[int, HabitDBM],
) -> int | None:
    if r.source_type == "task" and r.source_id in task_map:
        return task_map[r.source_id].goal_id
    if r.source_type == "habit" and r.source_id in habit_map:
        return habit_map[r.source_id].goal_id
    return None


def compute_streak(
    db: Session,
    user_id: int,
    report_date: date,
    *,
    excluded_habit_ids: set[int] | None = None,
) -> int:
    """Count consecutive days ending on report_date where at least one item was done.

    Public — also used by profile_service for the Profile page's "Current
    Streak" stat and streak-gated achievements, which intentionally call this
    with no exclusions: a habit opted out of *report* accounting should still
    count toward the user's personal streak elsewhere in the app. Only
    build_day_data (feeding the LLM's stats.best_streak) passes exclusions,
    so a day whose only completed item was an excluded habit doesn't count.
    """
    start = report_date - timedelta(days=60)
    conditions = [
        DailyPlanRecordDBM.user_id == user_id,
        DailyPlanRecordDBM.scheduled_date >= start,
        DailyPlanRecordDBM.scheduled_date <= report_date,
        DailyPlanRecordDBM.status == "done",
    ]
    if excluded_habit_ids:
        conditions.append(
            ~(
                (DailyPlanRecordDBM.source_type == "habit")
                & DailyPlanRecordDBM.source_id.in_(excluded_habit_ids)
            )
        )
    done_dates: set[date] = set(
        db.scalars(
            select(DailyPlanRecordDBM.scheduled_date)
            .where(*conditions)
            .distinct()
        ).all()
    )
    streak = 0
    check = report_date
    while check in done_dates:
        streak += 1
        check -= timedelta(days=1)
    return streak


# ── Public service functions ──────────────────────────────────────────────────

def build_day_data(db: Session, user_id: int, report_date: date, report_type: str = "daily") -> dict:
    """Assemble the day_data dict passed to the LLM for report generation."""

    if report_type == "weekly":
        # report_date is always Saturday; week spans Sunday–Saturday
        week_start = report_date - timedelta(days=6)
        primary_records: list[DailyPlanRecordDBM] = db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.user_id == user_id,
                DailyPlanRecordDBM.scheduled_date >= week_start,
                DailyPlanRecordDBM.scheduled_date <= report_date,
            )
        ).all()
        # Previous week for historical context
        history_start = week_start - timedelta(days=7)
        history_records: list[DailyPlanRecordDBM] = db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.user_id == user_id,
                DailyPlanRecordDBM.scheduled_date >= history_start,
                DailyPlanRecordDBM.scheduled_date < week_start,
            )
        ).all()
    else:
        # Daily: single day
        primary_records = db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.user_id == user_id,
                DailyPlanRecordDBM.scheduled_date == report_date,
            )
        ).all()
        # Past 7 days (excluding today) for historical context
        history_start = report_date - timedelta(days=7)
        history_records = db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.user_id == user_id,
                DailyPlanRecordDBM.scheduled_date >= history_start,
                DailyPlanRecordDBM.scheduled_date < report_date,
            )
        ).all()

    today_records = primary_records  # alias — rest of function uses today_records

    # Bulk-load source tasks and habits from both today + history to resolve goal links
    all_records = list(today_records) + list(history_records)
    task_ids = list({r.source_id for r in all_records if r.source_type == "task" and r.source_id})
    habit_ids = list({r.source_id for r in all_records if r.source_type == "habit" and r.source_id})

    task_map: dict[int, TaskDBM] = (
        {t.id: t for t in db.scalars(select(TaskDBM).where(TaskDBM.id.in_(task_ids))).all()}
        if task_ids else {}
    )
    habit_map: dict[int, HabitDBM] = (
        {h.id: h for h in db.scalars(select(HabitDBM).where(HabitDBM.id.in_(habit_ids))).all()}
        if habit_ids else {}
    )

    # Habits the user opted out of report accounting — drop their records
    # entirely so they never factor into stats, highlights, history, or the
    # LLM's input (everything below reads from today_records/history_records).
    excluded_habit_ids = {h.id for h in habit_map.values() if not h.include_in_report}
    if excluded_habit_ids:
        today_records = [
            r for r in today_records
            if not (r.source_type == "habit" and r.source_id in excluded_habit_ids)
        ]
        history_records = [
            r for r in history_records
            if not (r.source_type == "habit" and r.source_id in excluded_habit_ids)
        ]

    # Active goals
    goals: list[GoalDBM] = db.scalars(
        select(GoalDBM).where(GoalDBM.user_id == user_id, GoalDBM.status == "Active")
    ).all()
    goal_map = {g.id: g for g in goals}

    # Active milestone per goal (status = 'In Progress')
    milestone_by_goal: dict[int, MilestoneDBM] = {}
    if goal_map:
        milestones = db.scalars(
            select(MilestoneDBM).where(
                MilestoneDBM.goal_id.in_(list(goal_map.keys())),
                MilestoneDBM.status == "In Progress",
            )
        ).all()
        milestone_by_goal = {m.goal_id: m for m in milestones}

    # Today's stats — "task" and "schedule" both count as task-like items
    task_recs = [r for r in today_records if r.source_type in ("task", "schedule")]
    habit_recs = [r for r in today_records if r.source_type == "habit"]

    # Group today's records by goal for per-goal breakdown
    goal_records: dict[int, list[DailyPlanRecordDBM]] = defaultdict(list)
    for r in today_records:
        gid = _goal_id_for(r, task_map, habit_map)
        if gid and gid in goal_map:
            goal_records[gid].append(r)

    goals_payload = []
    for goal in goals:
        ms = milestone_by_goal.get(goal.id)
        recs = goal_records.get(goal.id, [])
        goals_payload.append({
            "goal_id": goal.id,
            "title": goal.title,
            "category": goal.category,
            "target_date": str(goal.target_date),
            "success_definition": goal.success_definition,
            "active_milestone": ms.title if ms else "No active milestone",
            "milestone_description": ms.description if ms else None,
            "milestone_progress": (
                f"{ms.completed_tasks}/{ms.total_tasks} tasks complete" if ms else None
            ),
            "tasks_done": sum(1 for r in recs if r.status == "done"),
            "tasks_total": len(recs),
            "task_records": [_record_to_dict(r) for r in recs],
        })

    # 7-day history grouped by date
    by_date: dict[date, list[DailyPlanRecordDBM]] = defaultdict(list)
    for r in history_records:
        by_date[r.scheduled_date].append(r)

    history = [
        {
            "date": str(d),
            "tasks_done": sum(1 for r in recs if r.source_type in ("task", "schedule") and r.status == "done"),
            "tasks_total": sum(1 for r in recs if r.source_type in ("task", "schedule")),
            "habits_done": sum(1 for r in recs if r.source_type == "habit" and r.status == "done"),
            "habits_total": sum(1 for r in recs if r.source_type == "habit"),
        }
        for d, recs in sorted(by_date.items())
    ]

    goal_history = []
    for goal in goals:
        days = []
        for d, recs in sorted(by_date.items()):
            g_recs = [r for r in recs if _goal_id_for(r, task_map, habit_map) == goal.id]
            if g_recs:
                days.append({
                    "date": str(d),
                    "tasks_done": sum(1 for r in g_recs if r.status == "done"),
                    "tasks_total": len(g_recs),
                })
        if days:
            goal_history.append({"goal_id": goal.id, "days": days})

    return {
        "stats": {
            "tasks_done": sum(1 for r in task_recs if r.status == "done"),
            "tasks_total": len(task_recs),
            "habits_done": sum(1 for r in habit_recs if r.status == "done"),
            "habits_total": len(habit_recs),
            "best_streak": compute_streak(db, user_id, report_date, excluded_habit_ids=excluded_habit_ids),
        },
        "goals": goals_payload,
        "all_records": [_record_to_dict(r) for r in today_records],
        "history": history,
        "goal_history": goal_history,
    }


def get_reports(db: Session, user_id: int, report_date: date) -> list[ReportDBM]:
    return list(db.scalars(
        select(ReportDBM)
        .where(
            ReportDBM.user_id == user_id,
            ReportDBM.report_date == report_date,
        )
        .order_by(desc(ReportDBM.generated_at))
    ).all())


def has_planned_items(db: Session, user_id: int, report_date: date, report_type: str) -> bool:
    """Cheap existence check — mirrors build_day_data's date range without loading full day data."""
    if report_type == "weekly":
        week_start = report_date - timedelta(days=6)
        date_filter = (
            DailyPlanRecordDBM.scheduled_date >= week_start,
            DailyPlanRecordDBM.scheduled_date <= report_date,
        )
    else:
        date_filter = (DailyPlanRecordDBM.scheduled_date == report_date,)

    return db.scalar(
        select(DailyPlanRecordDBM.id).where(
            DailyPlanRecordDBM.user_id == user_id,
            *date_filter,
        ).limit(1)
    ) is not None


def get_latest_report(db: Session, user_id: int) -> ReportDBM | None:
    """Most recent report across all dates/types for a user — None if none exist yet."""
    return db.scalar(
        select(ReportDBM)
        .where(ReportDBM.user_id == user_id)
        .order_by(desc(ReportDBM.report_date), desc(ReportDBM.generated_at))
        .limit(1)
    )


def to_report_response(report: ReportDBM) -> ReportResponse:
    return ReportResponse.model_validate({
        "date": report.report_date,
        "report_type": report.report_type,
        "generated_at": report.generated_at,
        "alignment_score": report.alignment_score,
        "headline": report.headline,
        "summary": report.summary,
        "stats": report.stats,
        "goals": report.goals,
        "highlights": report.highlights,
        "closing": report.closing,
    })


def save_report(
    db: Session,
    user_id: int,
    report_date: date,
    report_type: str,
    llm_result: GenerateReportFromLLM,
    day_data: dict,
) -> None:
    """Persist a generated report version into the reports table."""
    parsed = llm_result.report_data
    stats = day_data["stats"]

    llm_goal_map = {g.goal_id: g for g in parsed.goals}
    goals_payload = [
        {
            "id": gd["goal_id"],
            "title": gd["title"],
            "alignment_pct": llm_goal_map[gd["goal_id"]].alignment_pct if gd["goal_id"] in llm_goal_map else 0,
            "milestone_title": gd["active_milestone"],
            "note": llm_goal_map[gd["goal_id"]].note if gd["goal_id"] in llm_goal_map else "",
            "tasks_done": gd["tasks_done"],
            "tasks_total": gd["tasks_total"],
        }
        for gd in day_data["goals"]
    ]

    fields: dict = {
        "generated_at": datetime.now(timezone.utc),
        "alignment_score": parsed.alignment_score,
        "headline": parsed.headline,
        "summary": parsed.summary,
        "stats": {k: stats[k] for k in ("tasks_done", "tasks_total", "habits_done", "habits_total", "best_streak")},
        "goals": goals_payload,
        "highlights": {"good": parsed.highlights_good, "attention": parsed.highlights_attention},
        "closing": {
            "tone": "celebrate" if parsed.alignment_score >= 80 else ("motivate" if parsed.alignment_score < 40 else "guide"),
            "message": parsed.closing_message,
        },
        "model_used": llm_result.model_str or str(llm_result.model),
    }

    db.add(ReportDBM(user_id=user_id, report_date=report_date, report_type=report_type, **fields))
    db.commit()


async def generate_report_background(
    user_id: int,
    report_date: date,
    report_type: str,
    *,
    force: bool = False,
) -> None:
    """Background task: collect data, call LLM, and persist the result.

    force=True skips the duplicate check — use for manual user-triggered generation.
    force=False (default) is used by the scheduler to guard against double-firing on restart.
    """
    key = (user_id, report_date, report_type)
    if key in _in_progress:
        logger.info("Report generation already in progress for user=%d date=%s type=%s — skipping", user_id, report_date, report_type)
        return
    _in_progress.add(key)
    db = SessionLocal()
    try:
        if not force:
            existing = db.scalar(
                select(ReportDBM).where(
                    ReportDBM.user_id == user_id,
                    ReportDBM.report_date == report_date,
                    ReportDBM.report_type == report_type,
                )
            )
            if existing:
                logger.info(
                    "Skipping report — already exists for user=%d date=%s type=%s",
                    user_id, report_date, report_type,
                )
                return

        if not has_planned_items(db, user_id, report_date, report_type):
            logger.info(
                "Skipping report — no records for user=%d date=%s type=%s",
                user_id, report_date, report_type,
            )
            return
        day_data = build_day_data(db, user_id, report_date, report_type)
        llm_result = await get_llm_service().generate_report(
            user_id=user_id,
            report_date=str(report_date),
            report_type=report_type,
            day_data=day_data,
        )
        save_report(db, user_id, report_date, report_type, llm_result, day_data)
        user = db.get(UserDBM, user_id)
        if user:
            report = db.scalar(
                select(ReportDBM).where(
                    ReportDBM.user_id == user_id,
                    ReportDBM.report_date == report_date,
                    ReportDBM.report_type == report_type,
                ).order_by(ReportDBM.generated_at.desc())
            )
            label = report_type.capitalize()
            # Manual trigger (force=True) still needs a unique event_key to bypass
            # dedup against a prior notification for the same report — but it must
            # keep the "report:" prefix so the notification list can still recognise
            # and icon it as a report (see NotificationsPage.constants.ts).
            base_key = f"report:{user_id}:{report_date}:{report_type}"
            event_key = f"{base_key}:{int(datetime.now(timezone.utc).timestamp())}" if force else base_key
            notifications_service.create_notification(
                db, user,
                title=f"Your {label} report for {report_date.strftime('%d %b')} is ready",
                body=report.headline if report else None,
                type="agent",
                level=notifications_service.LEVEL_CRITICAL,
                url=f"/reports/{report_date}",
                event_key=event_key,
                # This sends its own full-snapshot report email below instead
                # of create_notification's generic title+body template.
                send_email=False,
            )
            if report:
                try:
                    from app.services import email_notification_service
                    email_notification_service.send_report_email(db, user, to_report_response(report))
                except Exception:
                    logger.warning(
                        "Failed to send report-ready email for user=%d date=%s type=%s",
                        user_id, report_date, report_type, exc_info=True,
                    )
    except Exception:
        db.rollback()
        logger.exception(
            "Report generation failed for user=%d date=%s type=%s",
            user_id, report_date, report_type,
        )
        try:
            user = db.get(UserDBM, user_id)
            if user:
                label = report_type.capitalize()
                notifications_service.create_notification(
                    db, user,
                    title=f"Your {label} report for {report_date.strftime('%d %b')} couldn't be generated",
                    body="Something went wrong while generating your report. Please try again.",
                    type="warning",
                    level=notifications_service.LEVEL_CRITICAL,
                )
        except Exception:
            logger.exception(
                "Failed to send report-generation-failed notification for user=%d date=%s type=%s",
                user_id, report_date, report_type,
            )
    finally:
        _in_progress.discard(key)
        db.close()


def send_report_email_background(user_id: int, report_date: date, report_type: str) -> None:
    """Background task for the Report Details page's "Email report" button.
    Opens its own session — same reasoning as generate_report_background: the
    request-scoped session is already closed by the time a background task
    actually runs."""
    from app.services import email_notification_service

    db = SessionLocal()
    try:
        user = db.get(UserDBM, user_id)
        if user is None:
            return
        reports = [r for r in get_reports(db, user_id, report_date) if r.report_type == report_type]
        if not reports:
            logger.info(
                "No report to email for user=%d date=%s type=%s — skipping",
                user_id, report_date, report_type,
            )
            return
        email_notification_service.send_report_email(db, user, to_report_response(reports[0]), force=True)
    except Exception:
        logger.exception(
            "Failed to email report for user=%d date=%s type=%s",
            user_id, report_date, report_type,
        )
    finally:
        db.close()
