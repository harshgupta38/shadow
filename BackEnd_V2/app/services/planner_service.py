"""
Planner service — recurring plan management and date-based scheduling.

Architecture:
    Habit ──────┐
                ├──> PlanDBM ──> get_plans_for_date()
    Task ───────┘

A RecurringPlan is a persistent definition, NOT a per-date occurrence row.
The recurrence matching logic lives entirely in _matches_date().
"""

import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.habit import HabitDBM
from app.models.plan import PlanDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.planner import DailyPlanItemResponse


# Ordered Monday=0 … Sunday=6, matching date.weekday().
_DAY_NAMES = [
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
]

_PRIORITY_ORDER = {"highest": 0, "high": 1, "medium": 2, "low": 3, "lowest": 4}
_TIME_ORDER = {
    "morning": 0, "afternoon": 1, "evening": 2,
    "night": 3, "custom": 4, "flexible": 5,
}

# Task statuses where the plan should remain active.
_TASK_ACTIVE_STATUSES = {"In Progress"}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _last_day_of_month(d: date) -> int:
    return calendar.monthrange(d.year, d.month)[1]


def _matches_date(plan: PlanDBM, target: date) -> bool:
    """Return True if this recurring plan applies to the given date."""
    if plan.status != "active":
        return False

    if plan.start_date and target < plan.start_date:
        return False
    if plan.end_date and target > plan.end_date:
        return False

    freqs = set(plan.frequencies)
    wd = target.weekday()  # 0 = Monday … 6 = Sunday
    day = target.day

    if "daily" in freqs:
        return True

    # Named weekday match.
    if _DAY_NAMES[wd] in freqs:
        return True

    if "weekdays" in freqs and wd <= 4:   # Monday–Friday
        return True

    if "weekends" in freqs and wd >= 5:   # Saturday–Sunday
        return True

    # weekly / monthly — unspecified-day recurrences appear every day;
    # completion counting is a future feature.
    if "weekly" in freqs or "monthly" in freqs:
        return True

    if "first_of_month" in freqs and day == 1:
        return True

    if "end_of_month" in freqs:
        if day == _last_day_of_month(target):
            return True

    if "specific_day" in freqs:
        specific_days: list[int] = plan.specific_days or []
        if day in specific_days:
            return True
        # day_fallback: if all chosen days exceed the month's last day,
        # fall back to the last day of that month.
        if plan.day_fallback:
            last = _last_day_of_month(target)
            if day == last and any(d > last for d in specific_days):
                return True

    return False


def _normalize(planner_type: str, planner_target, value_unit) -> tuple[int | None, str | None]:
    if planner_type == "simple":
        return 1, "occurrence"
    return (int(planner_target) if planner_target is not None else None), value_unit


def _find_plan(db: Session, source_type: str, source_id: int) -> PlanDBM | None:
    return db.scalar(
        select(PlanDBM).where(
            PlanDBM.source_type == source_type,
            PlanDBM.source_id == source_id,
        )
    )


def _apply_fields(plan: PlanDBM, fields: dict) -> None:
    for k, v in fields.items():
        setattr(plan, k, v)


def _sort_key(plan: PlanDBM) -> tuple:
    return (
        _PRIORITY_ORDER.get(plan.priority, 99),
        _TIME_ORDER.get(plan.preferred_time, 99),
        plan.id,
    )


# ── Public sync API ───────────────────────────────────────────────────────────

def sync_plan_from_habit(db: Session, habit: HabitDBM) -> None:
    """Create or update (or deactivate) the recurring plan for a habit.

    Called after every habit create/update so the plan mirrors the habit.
    Habit status maps directly: active → active, paused → paused, archived → archived.
    """
    plan = _find_plan(db, "habit", habit.id)
    target, unit = _normalize(habit.planner_type, habit.planner_target, habit.value_unit)

    fields = {
        "user_id": habit.user_id,
        "source_type": "habit",
        "source_id": habit.id,
        "title": habit.title,
        "planner_type": habit.planner_type,
        "planner_target": target,
        "value_unit": unit,
        "frequencies": list(habit.frequencies),
        "weekly_count": habit.weekly_count,
        "monthly_count": habit.monthly_count,
        "specific_days": habit.specific_days,
        "day_fallback": habit.day_fallback,
        "preferred_time": habit.preferred_time,
        "specific_time": habit.specific_time,
        "duration_minutes": habit.duration_minutes,
        "priority": habit.priority,
        # If user set no start_date, use creation date so the plan never
        # appears on dates before the habit existed.
        "start_date": habit.start_date or habit.created_at.date(),
        "end_date": habit.end_date,
        "status": habit.status,  # active / paused / archived — direct mirror
    }

    if plan is None:
        db.add(PlanDBM(**fields))
    else:
        _apply_fields(plan, fields)

    db.commit()


def sync_plan_from_task(db: Session, task: TaskDBM) -> None:
    """Create or update (or deactivate) the recurring plan for a task.

    A plan is active only when planning_enabled=True, task is Numeric,
    and the task is in an active status (Not Started or In Progress).
    Any other combination deactivates the plan.
    """
    plan = _find_plan(db, "task", task.id)

    should_be_active = (
        task.planning_enabled
        and task.task_type == "Numeric"
        and task.status in _TASK_ACTIVE_STATUSES
    )

    if not should_be_active:
        if plan is not None and plan.status != "archived":
            plan.status = "archived"
            db.commit()
        return

    target, unit = _normalize(task.planner_type, task.planner_target, task.value_unit)

    fields = {
        "user_id": task.user_id,
        "source_type": "task",
        "source_id": task.id,
        "title": task.title,
        "planner_type": task.planner_type,
        "planner_target": target,
        "value_unit": unit,
        "frequencies": list(task.frequencies),
        "weekly_count": task.weekly_count,
        "monthly_count": task.monthly_count,
        "specific_days": task.specific_days,
        "day_fallback": task.day_fallback,
        "preferred_time": task.preferred_time,
        "specific_time": task.specific_time,
        "duration_minutes": task.duration_minutes,
        "priority": task.priority,
        # Tasks have no explicit date window, so anchor to creation date.
        "start_date": task.created_at.date(),
        "end_date": None,
        "status": "active",
    }

    if plan is None:
        db.add(PlanDBM(**fields))
    else:
        _apply_fields(plan, fields)

    db.commit()


def deactivate_plan(db: Session, source_type: str, source_id: int) -> None:
    """Archive the recurring plan for a deleted/disabled source.

    Safe to call even if no plan exists.
    """
    plan = _find_plan(db, source_type, source_id)
    if plan is not None and plan.status != "archived":
        plan.status = "archived"
        db.commit()


# ── Backfill ─────────────────────────────────────────────────────────────────

def sync_all_plans(db: Session) -> None:
    """Sync plan rows for every habit and planning-enabled task across all users.

    Called on server startup so the plans table is always up to date even if
    habits/tasks were created or edited while the server was down.
    """
    habits = db.scalars(select(HabitDBM)).all()
    for habit in habits:
        sync_plan_from_habit(db, habit)

    tasks = db.scalars(
        select(TaskDBM).where(TaskDBM.planning_enabled.is_(True))
    ).all()
    for task in tasks:
        sync_plan_from_task(db, task)



# ── Daily planner query ───────────────────────────────────────────────────────

def get_plans_for_date(
    db: Session,
    current_user: UserDBM,
    target_date: date,
) -> list[DailyPlanItemResponse]:
    """Return all recurring plans that apply to target_date for current_user.

    Does NOT create any new database rows — purely a read + filter operation.
    Results are sorted by priority → preferred_time → id.
    """
    active_plans = db.scalars(
        select(PlanDBM).where(
            PlanDBM.user_id == current_user.id,
            PlanDBM.status == "active",
        )
    ).all()

    matched = sorted(
        (p for p in active_plans if _matches_date(p, target_date)),
        key=_sort_key,
    )

    return [
        DailyPlanItemResponse(
            plan_id=p.id,
            source_type=p.source_type,
            source_id=p.source_id,
            title=p.title,
            planner_type=p.planner_type,
            planner_target=p.planner_target,
            value_unit=p.value_unit,
            priority=p.priority,
            preferred_time=p.preferred_time,
            specific_time=p.specific_time,
            duration_minutes=p.duration_minutes,
        )
        for p in matched
    ]
