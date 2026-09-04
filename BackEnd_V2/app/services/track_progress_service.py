from datetime import date, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.habit import HabitDBM
from app.models.plan import PlanDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.user import UserDBM
from app.schemas.track_progress import EligibleHabitItem, HabitTrackItem
from app.services import planner_service

_COLOR_KEYS = ["success", "info", "brand", "warn", "violet"]


def _color(habit_id: int) -> str:
    return _COLOR_KEYS[habit_id % len(_COLOR_KEYS)]


def get_eligible_habits(
    db: Session,
    current_user: UserDBM,
) -> list[EligibleHabitItem]:
    today = date.today()
    habits = db.scalars(
        select(HabitDBM)
        .where(
            HabitDBM.user_id == current_user.id,
            HabitDBM.status == "active",
            or_(HabitDBM.start_date.is_(None), HabitDBM.start_date <= today),
            or_(HabitDBM.end_date.is_(None), HabitDBM.end_date >= today),
        )
        .order_by(HabitDBM.updated_at.desc(), HabitDBM.id.desc())
    ).all()
    return [
        EligibleHabitItem(
            id=h.id,
            title=h.title,
            category=h.category,
            priority=h.priority,
            planner_type=h.planner_type,
        )
        for h in habits
    ]


def get_habits_with_history(
    db: Session,
    current_user: UserDBM,
    *,
    today: date | None = None,
) -> list[HabitTrackItem]:
    if today is None:
        today = date.today()
    # Week always starts on Sunday (Python weekday: Mon=0…Sun=6)
    days_since_sunday = (today.weekday() + 1) % 7
    week_start = today - timedelta(days=days_since_sunday)

    habits = db.scalars(
        select(HabitDBM)
        .where(
            HabitDBM.user_id == current_user.id,
            HabitDBM.tracking_enabled == True,  # noqa: E712
            HabitDBM.status == "active",
            or_(HabitDBM.start_date.is_(None), HabitDBM.start_date <= today),
            or_(HabitDBM.end_date.is_(None), HabitDBM.end_date >= today),
        )
        .order_by(HabitDBM.updated_at.desc(), HabitDBM.id.desc())
    ).all()

    if not habits:
        return []

    habit_ids = [h.id for h in habits]

    plans = db.scalars(
        select(PlanDBM).where(
            PlanDBM.source_type == "habit",
            PlanDBM.source_id.in_(habit_ids),
            PlanDBM.user_id == current_user.id,
        )
    ).all()
    plan_by_habit_id: dict[int, PlanDBM] = {p.source_id: p for p in plans}
    plan_ids = [p.id for p in plans]

    # Load all records up to today in one query; group two ways.
    records_for_streak: dict[int, list[DailyPlanRecordDBM]] = {}   # plan_id → all records
    records_for_history: dict[int, dict[date, DailyPlanRecordDBM]] = {h.id: {} for h in habits}

    if plan_ids:
        for r in db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.plan_id.in_(plan_ids),
                DailyPlanRecordDBM.user_id == current_user.id,
                DailyPlanRecordDBM.scheduled_date <= today,
            )
        ).all():
            records_for_streak.setdefault(r.plan_id, []).append(r)
            if r.scheduled_date >= week_start and r.source_id in records_for_history:
                records_for_history[r.source_id][r.scheduled_date] = r

    result: list[HabitTrackItem] = []
    for habit in habits:
        plan = plan_by_habit_id.get(habit.id)
        plan_records = records_for_streak.get(plan.id, []) if plan else []
        current_streak, max_streak = (
            planner_service.compute_streaks(plan, plan_records, today)
            if plan else (0, 0)
        )

        day_map = records_for_history[habit.id]
        is_metric = habit.planner_type == "metric"

        # 7 entries: index 0 = Sunday … index 6 = Saturday; future days are 0
        history: list[int] = []
        for i in range(7):
            day = week_start + timedelta(days=i)
            if day > today:
                history.append(0)
                continue
            rec = day_map.get(day)
            if rec and rec.status == "done":
                history.append(int(rec.actual_value) if is_metric else 1)
            else:
                history.append(0)

        today_rec = day_map.get(today)
        done_today = bool(today_rec and today_rec.status == "done")
        current_value = int(today_rec.actual_value) if today_rec else 0

        result.append(HabitTrackItem(
            id=habit.id,
            title=habit.title,
            category=habit.category,
            planner_type=habit.planner_type,
            planner_target=habit.planner_target,
            value_unit=habit.value_unit,
            current_streak=current_streak,
            max_streak=max_streak,
            history=history,
            done_today=done_today,
            current_value=current_value,
            color=_color(habit.id),
        ))

    return result
