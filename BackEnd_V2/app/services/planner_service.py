"""
Planner service — recurring plan management and date-based scheduling.

Architecture:
    Habit ──────┐
                ├──> PlanDBM ──> get_plans_for_date() ──> DailyPlanRecordDBM
    Task ───────┘

PlanDBM is a persistent recurring-plan definition.
DailyPlanRecordDBM is a per-date progress snapshot created on first access.

Missed past occurrences are inferred from recurrence rules — an applicable date
with no record is treated as missed without creating a DB row.  Streak values
are computed on read from history + recurrence rules and are never persisted.
"""

import calendar
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError, NotFoundError
from app.models.plan_record import DailyPlanRecordDBM
from app.models.goal import GoalDBM
from app.models.habit import HabitDBM
from app.models.plan import PlanDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.planner import (
    DailyPlanItemResponse,
    DailyPlanResponse,
    DailyPlanSavedData,
    GoalDataInPlan,
)


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


# ── Recurrence helpers ────────────────────────────────────────────────────────

def _last_day_of_month(d: date) -> int:
    return calendar.monthrange(d.year, d.month)[1]


def _freq_matches(plan: PlanDBM, target: date) -> bool:
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


def _matches_date(plan: PlanDBM, target: date) -> bool:
    """Return True if this recurring plan applies to the given date."""
    if plan.status != "active":
        return False
    if plan.start_date and target < plan.start_date:
        return False
    if plan.end_date and target > plan.end_date:
        return False
    return _freq_matches(plan, target)


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


# ── Streak calculation ────────────────────────────────────────────────────────

def _applicable_occurrence_dates(plan: PlanDBM, as_of_date: date) -> list[date]:
    """Return all dates plan applies to from start_date through as_of_date.

    Returns an empty list for weekly/monthly (count-based) recurrences because
    those don't map to discrete per-day occurrences suitable for streak tracking.
    """
    freqs = set(plan.frequencies)

    # Count-based: no per-day discrete occurrences — skip streak calculation.
    if "weekly" in freqs or "monthly" in freqs:
        return []

    start = plan.start_date or as_of_date
    if start > as_of_date:
        return []

    results: list[date] = []
    cursor = start
    while cursor <= as_of_date:
        if plan.end_date and cursor > plan.end_date:
            break
        if _freq_matches(plan, cursor):
            results.append(cursor)
        cursor += timedelta(days=1)

    return results


def compute_streaks(
    plan: PlanDBM,
    records: list[DailyPlanRecordDBM],
    as_of_date: date,
) -> tuple[int, int]:
    """Return (current_streak, max_streak) from recurrence rules and execution history.

    A missing record for an applicable past date counts as missed (breaks streak).
    A missing or due record for today leaves the streak unchanged (in-progress day).
    Dates the plan does not apply to are skipped.
    """
    applicable_dates = _applicable_occurrence_dates(plan, as_of_date)
    if not applicable_dates:
        return 0, 0

    record_status: dict[date, str] = {r.scheduled_date: r.status for r in records}
    today = as_of_date
    running = 0
    max_streak = 0

    for d in applicable_dates:
        status = record_status.get(d)

        if d == today:
            if status == "done":
                running += 1
                max_streak = max(max_streak, running)
            elif status == "missed":
                running = 0
            # "due" or no record: leave running unchanged — day still in progress
        else:
            # Past date: no record = missed = break streak
            if status == "done":
                running += 1
                max_streak = max(max_streak, running)
            else:
                running = 0

    return running, max_streak


def compute_streaks_for_plan(db: Session, plan: PlanDBM, as_of_date: date) -> tuple[int, int]:
    """Load records from DB then compute streaks (used in single-record update paths)."""
    records = list(db.scalars(
        select(DailyPlanRecordDBM).where(
            DailyPlanRecordDBM.plan_id == plan.id,
            DailyPlanRecordDBM.user_id == plan.user_id,
            DailyPlanRecordDBM.scheduled_date <= as_of_date,
        )
    ).all())
    return compute_streaks(plan, records, as_of_date)


# ── Record helpers ────────────────────────────────────────────────────────────

def _sort_key_record(r: DailyPlanRecordDBM) -> tuple:
    return (
        _PRIORITY_ORDER.get(r.priority, 99),
        _TIME_ORDER.get(r.preferred_time, 99),
        r.id,
    )


def _record_to_saved_data(
    record: DailyPlanRecordDBM,
    current_streak: int = 0,
    max_streak: int = 0,
    treat_due_as_missed: bool = False,
) -> DailyPlanSavedData:
    # A past date whose record was never completed reads as "missed", same as a
    # day with no record at all — the stored "due" status is left untouched.
    status = "missed" if treat_due_as_missed and record.status == "due" else record.status
    return DailyPlanSavedData(
        record_id=record.id,
        status=status,
        current_value=record.actual_value,
        current_streak=current_streak,
        max_streak=max_streak,
        note=record.note or "",
    )


def _build_plan_snapshot(plan: PlanDBM) -> dict:
    """Return the snapshot fields that a DailyPlanRecordDBM copies from its plan.

    Single source of truth used by both initial materialisation and today's sync,
    so the two paths can never drift apart.
    """
    target, unit = _normalize(plan.planner_type, plan.planner_target, plan.value_unit)
    return {
        "title": plan.title,
        "planner_type": plan.planner_type,
        "planner_target": target,
        "value_unit": unit,
        "priority": plan.priority,
        "preferred_time": plan.preferred_time,
        "specific_time": plan.specific_time,
        "duration_minutes": plan.duration_minutes,
    }


def _materialize_record(
    db: Session, plan: PlanDBM, scheduled_date: date
) -> DailyPlanRecordDBM:
    """Return existing record or create a new snapshot for plan on scheduled_date."""
    existing = db.scalar(
        select(DailyPlanRecordDBM).where(
            DailyPlanRecordDBM.plan_id == plan.id,
            DailyPlanRecordDBM.scheduled_date == scheduled_date,
        )
    )
    if existing is not None:
        return existing

    record = DailyPlanRecordDBM(
        user_id=plan.user_id,
        plan_id=plan.id,
        source_type=plan.source_type,
        source_id=plan.source_id,
        scheduled_date=scheduled_date,
        status="due",
        actual_value=0,
        **_build_plan_snapshot(plan),
    )
    db.add(record)
    db.flush()
    return record



def _enrich_goals(
    db: Session,
    source_pairs: list[tuple[str | None, int | None]],
) -> dict[tuple, GoalDataInPlan | None]:
    """Bulk-load goal info for (source_type, source_id) pairs — no N+1 queries."""
    habit_ids = [sid for st, sid in source_pairs if st == "habit" and sid]
    task_ids = [sid for st, sid in source_pairs if st == "task" and sid]
    schedule_ids = [sid for st, sid in source_pairs if st == "schedule" and sid]

    habit_goal: dict[int, int | None] = {}
    if habit_ids:
        for h in db.scalars(select(HabitDBM).where(HabitDBM.id.in_(habit_ids))).all():
            habit_goal[h.id] = h.goal_id

    task_goal: dict[int, int | None] = {}
    if task_ids:
        for t in db.scalars(select(TaskDBM).where(TaskDBM.id.in_(task_ids))).all():
            task_goal[t.id] = t.goal_id

    schedule_goal: dict[int, int | None] = {}
    if schedule_ids:
        for s in db.scalars(select(ScheduledTaskDBM).where(ScheduledTaskDBM.id.in_(schedule_ids))).all():
            schedule_goal[s.id] = s.goal_id

    all_goal_ids = (
        {g for g in habit_goal.values() if g}
        | {g for g in task_goal.values() if g}
        | {g for g in schedule_goal.values() if g}
    )
    goal_objs: dict[int, GoalDBM] = {}
    if all_goal_ids:
        for g in db.scalars(select(GoalDBM).where(GoalDBM.id.in_(all_goal_ids))).all():
            goal_objs[g.id] = g

    result: dict[tuple, GoalDataInPlan | None] = {}
    for st, sid in source_pairs:
        gid: int | None = None
        if st == "habit" and sid:
            gid = habit_goal.get(sid)
        elif st == "task" and sid:
            gid = task_goal.get(sid)
        elif st == "schedule" and sid:
            gid = schedule_goal.get(sid)
        if gid and gid in goal_objs:
            g = goal_objs[gid]
            result[(st, sid)] = GoalDataInPlan(id=gid, title=g.title, category=g.category)
        else:
            result[(st, sid)] = None
    return result


# ── Today-record synchronisation ─────────────────────────────────────────────

def _recompute_task_progress(db: Session, task_id: int) -> None:
    """Re-derive TaskDBM.current_value from the surviving plan records.

    Deleting a record removes the progress it carried, so the task total has to
    be recomputed or it keeps counting rows that no longer exist.  Binary tasks
    are skipped: ck_tasks_simple_fields requires their current_value to be NULL.
    """
    db.flush()  # emit pending ORM deletes so the SUM below excludes them
    task = db.get(TaskDBM, task_id)
    if task is None or task.task_type != "Numeric":
        return
    task.current_value = db.scalar(
        select(func.sum(DailyPlanRecordDBM.actual_value)).where(
            DailyPlanRecordDBM.source_type == "task",
            DailyPlanRecordDBM.source_id == task_id,
        )
    ) or 0


def _apply_metric_status(record: DailyPlanRecordDBM) -> None:
    """Re-derive status and completed_at from actual_value vs planner_target.

    Called after planner_target changes so the record stays internally consistent.
    'missed' is a deliberate user action and is never overridden here.
    'done' is re-evaluated: if the target was raised above actual_value, the
    record reverts to 'due' so the planner does not show a false completion.
    """
    if record.status == "missed":
        return
    target = record.planner_target or 0
    if target > 0 and record.actual_value >= target:
        record.status = "done"
        if record.completed_at is None:
            record.completed_at = datetime.now(timezone.utc)
    else:
        record.status = "due"
        record.completed_at = None


def _sync_today_record(db: Session, plan: PlanDBM) -> None:
    """Synchronise today's DailyPlanRecordDBM with the current plan state.

    Called immediately after a Habit or Task edit so the planner reflects the
    change without the user needing to reload.

    Three cases:
      today matches + record exists   → refresh snapshot fields; preserve progress;
                                        re-derive metric completion if target changed.
      today matches + no record       → create a fresh record (same as first open).
      today no longer matches         → delete today's record, mirroring pause/archive:
                                        a habit that is not scheduled today has no
                                        entry today and leaves none in history.
    Past records are never touched.
    """
    today = date.today()
    today_matches = _matches_date(plan, today)

    record: DailyPlanRecordDBM | None = db.scalar(
        select(DailyPlanRecordDBM).where(
            DailyPlanRecordDBM.plan_id == plan.id,
            DailyPlanRecordDBM.scheduled_date == today,
        )
    )

    if not today_matches:
        if record is not None:
            db.delete(record)
            if plan.source_type == "task":
                _recompute_task_progress(db, plan.source_id)
        return

    if record is None:
        _materialize_record(db, plan, today)
        return

    # Today matches and record already exists — update snapshot, preserve progress.
    snapshot = _build_plan_snapshot(plan)
    for key, value in snapshot.items():
        setattr(record, key, value)

    if record.planner_type == "metric":
        _apply_metric_status(record)


# ── Public sync API ───────────────────────────────────────────────────────────

def sync_plan_from_habit(db: Session, habit: HabitDBM) -> None:
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
        "start_date": habit.start_date or habit.created_at.replace(tzinfo=timezone.utc).astimezone().date(),
        "end_date": habit.end_date,
        "status": habit.status,  # active / paused / archived — direct mirror
    }

    if plan is None:
        plan = PlanDBM(**fields)
        db.add(plan)
        db.flush()  # populate plan.id before _sync_today_record queries by it
    else:
        _apply_fields(plan, fields)

    if habit.status in ("paused", "archived"):
        _purge_today_records(db, "habit", habit.id)
    else:
        _sync_today_record(db, plan)

    db.commit()


def sync_plan_from_task(db: Session, task: TaskDBM) -> None:
    plan = _find_plan(db, "task", task.id)

    should_be_active = (
        task.planning_enabled
        and task.task_type == "Numeric"
        and task.status in _TASK_ACTIVE_STATUSES
    )

    if not should_be_active:
        if plan is not None and plan.status != "archived":
            plan.status = "archived"
        _purge_today_records(db, "task", task.id)
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
        # Anchor to when the task was started, falling back to creation date.
        "start_date": (task.started_at or task.created_at).date(),
        "end_date": None,
        "status": "active",
    }

    if plan is None:
        plan = PlanDBM(**fields)
        db.add(plan)
        db.flush()  # populate plan.id before _sync_today_record queries by it
    else:
        _apply_fields(plan, fields)

    _sync_today_record(db, plan)
    db.commit()


def _purge_today_records(db: Session, source_type: str, source_id: int) -> None:
    """Delete plan_records for today onwards — keeps past history intact."""
    db.execute(
        delete(DailyPlanRecordDBM).where(
            DailyPlanRecordDBM.source_type == source_type,
            DailyPlanRecordDBM.source_id == source_id,
            DailyPlanRecordDBM.scheduled_date >= date.today(),
        )
    )
    if source_type == "task":
        _recompute_task_progress(db, source_id)


def deactivate_plan(db: Session, source_type: str, source_id: int) -> None:
    plan = _find_plan(db, source_type, source_id)
    if plan is not None and plan.status != "archived":
        plan.status = "archived"
    _purge_today_records(db, source_type, source_id)


# ── Scheduled-task sync ───────────────────────────────────────────────────────

def _sync_plan_for_scheduled_task(db: Session, task: ScheduledTaskDBM) -> None:
    """Create or update PlanDBM for a one-time scheduled task (no commit).

    scheduled_date is never mutated.  For snoozed tasks, end_date is extended
    to today so _matches_date includes the current day; for upcoming tasks
    end_date equals scheduled_date (one-time occurrence).
    """
    plan = _find_plan(db, "schedule", task.id)
    target, unit = _normalize(task.planner_type, task.planner_target, task.value_unit)

    # Snoozed: extend the window to today; upcoming/completed/missed: keep original.
    effective_end = date.today() if task.status == "snoozed" else task.scheduled_date

    fields = {
        "user_id": task.user_id,
        "source_type": "schedule",
        "source_id": task.id,
        "title": task.title,
        "planner_type": task.planner_type,
        "planner_target": target,
        "value_unit": unit,
        "frequencies": ["daily"],
        "weekly_count": None,
        "monthly_count": None,
        "specific_days": None,
        "day_fallback": False,
        "preferred_time": task.preferred_time,
        "specific_time": task.specific_time,
        "duration_minutes": task.duration_minutes,
        "priority": task.priority,
        "start_date": task.scheduled_date,
        "end_date": effective_end,
        "status": "active",
    }

    if plan is None:
        plan = PlanDBM(**fields)
        db.add(plan)
        db.flush()
    else:
        _apply_fields(plan, fields)

    _sync_today_record(db, plan)


def sync_plan_from_scheduled_task(db: Session, task: ScheduledTaskDBM) -> None:
    _sync_plan_for_scheduled_task(db, task)
    db.commit()


def tick_scheduled_tasks(db: Session, user_id: int, today: date) -> None:
    """Process overdue scheduled tasks: snooze eligible ones, mark the rest missed.

    scheduled_date is NEVER mutated — it always reflects the original intent.
    snooze_limit is interpreted as "max days after scheduled_date we will keep
    showing the task"; the count is derived as (today − scheduled_date).days.
    """
    overdue = list(db.scalars(
        select(ScheduledTaskDBM).where(
            ScheduledTaskDBM.user_id == user_id,
            ScheduledTaskDBM.scheduled_date < today,
            ScheduledTaskDBM.status.in_(["upcoming", "snoozed"]),
        )
    ).all())

    if not overdue:
        return

    for task in overdue:
        days_overdue = (today - task.scheduled_date).days
        can_snooze = (
            task.allow_snoozing
            and (task.snooze_limit is None or days_overdue <= task.snooze_limit)
        )

        if can_snooze:
            task.status = "snoozed"
            _sync_plan_for_scheduled_task(db, task)  # extends end_date to today
        else:
            task.status = "missed"
            plan = _find_plan(db, "schedule", task.id)
            if plan is not None and plan.status != "archived":
                plan.status = "archived"
            db.execute(
                delete(DailyPlanRecordDBM).where(
                    DailyPlanRecordDBM.source_type == "schedule",
                    DailyPlanRecordDBM.source_id == task.id,
                    DailyPlanRecordDBM.scheduled_date >= today,
                )
            )

    db.commit()


# ── Backfill ─────────────────────────────────────────────────────────────────

def sync_all_plans(db: Session) -> None:
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
) -> DailyPlanResponse:
    today = date.today()

    if target_date > today:
        raise AppError("Future dates are not allowed.")

    # Tick overdue scheduled tasks before loading plans so snoozed tasks
    # show as today's items and missed tasks don't appear.
    if target_date == today:
        tick_scheduled_tasks(db, current_user.id, today)

    # Shared: load all active plans once (reused for today + yesterday calculations).
    active_plans = list(db.scalars(
        select(PlanDBM).where(
            PlanDBM.user_id == current_user.id,
            PlanDBM.status == "active",
        )
    ).all())

    if target_date == today:
        matched = [p for p in active_plans if _matches_date(p, target_date)]
        plan_by_id = {p.id: p for p in matched}

        records: list[DailyPlanRecordDBM] = [
            _materialize_record(db, plan, target_date) for plan in matched
        ]
        db.commit()

        # Batch-load full history for streak computation (single query).
        today_plan_ids = [r.plan_id for r in records if r.plan_id is not None]
        all_history = list(db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.plan_id.in_(today_plan_ids),
                DailyPlanRecordDBM.user_id == current_user.id,
                DailyPlanRecordDBM.scheduled_date <= today,
            )
        ).all()) if today_plan_ids else []

        history_by_plan: dict[int, list[DailyPlanRecordDBM]] = defaultdict(list)
        for r in all_history:
            history_by_plan[r.plan_id].append(r)

        records.sort(key=_sort_key_record)

        source_pairs = [(r.source_type, r.source_id) for r in records]
        goal_by_source = _enrich_goals(db, source_pairs)

        items = []
        for record in records:
            plan = plan_by_id.get(record.plan_id) if record.plan_id else None
            cs, ms = (
                compute_streaks(plan, history_by_plan[record.plan_id], today)
                if plan else (0, 0)
            )
            items.append(DailyPlanItemResponse(
                plan_id=record.plan_id,
                source_type=record.source_type,
                source_id=record.source_id,
                title=record.title,
                planner_type=record.planner_type,
                planner_target=record.planner_target,
                value_unit=record.value_unit,
                priority=record.priority,
                preferred_time=record.preferred_time,
                specific_time=record.specific_time,
                duration_minutes=record.duration_minutes,
                goal=goal_by_source.get((record.source_type, record.source_id)),
                saved_data=_record_to_saved_data(record, cs, ms),
            ))

    else:
        # ── Past date ──────────────────────────────────────────────────────────
        # Show: applicable plans with records (real data), applicable plans
        # without records (synthesized missed), and saved records for plans that
        # are now archived (previously opened dates).
        applicable = [p for p in active_plans if _matches_date(p, target_date)]

        # All records already saved for this date (includes archived-plan records).
        saved_records = list(db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.user_id == current_user.id,
                DailyPlanRecordDBM.scheduled_date == target_date,
            )
        ).all())
        saved_by_plan_id = {r.plan_id: r for r in saved_records if r.plan_id is not None}

        # Batch-load history for streak computation.
        all_plan_ids = list(
            {p.id for p in applicable} | {r.plan_id for r in saved_records if r.plan_id}
        )
        all_history = list(db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.plan_id.in_(all_plan_ids),
                DailyPlanRecordDBM.user_id == current_user.id,
                DailyPlanRecordDBM.scheduled_date <= target_date,
            )
        ).all()) if all_plan_ids else []

        history_by_plan: dict[int, list[DailyPlanRecordDBM]] = defaultdict(list)
        for r in all_history:
            history_by_plan[r.plan_id].append(r)

        # Build occurrence list (plan, record): record=None → synthesized missed.
        occurrences: list[tuple[PlanDBM | None, DailyPlanRecordDBM | None]] = []
        covered: set[int | None] = set()

        for plan in applicable:
            record = saved_by_plan_id.get(plan.id)
            occurrences.append((plan, record))
            covered.add(plan.id)

        # Include records for non-applicable plans (archived plan, date was opened before).
        # Skip records with plan_id=None (plan deleted — insufficient data to display).
        for record in saved_records:
            if record.plan_id is not None and record.plan_id not in covered:
                occurrences.append((None, record))
                covered.add(record.plan_id)

        def _occ_sort_key(occ: tuple) -> tuple:
            plan, record = occ
            if record is not None:
                return (
                    _PRIORITY_ORDER.get(record.priority, 99),
                    _TIME_ORDER.get(record.preferred_time, 99),
                    record.id,
                )
            return (
                _PRIORITY_ORDER.get(plan.priority, 99),
                _TIME_ORDER.get(plan.preferred_time, 99),
                plan.id,
            )

        occurrences.sort(key=_occ_sort_key)

        # Collect source pairs for goal enrichment.
        source_pairs = []
        for plan, record in occurrences:
            if record is not None:
                source_pairs.append((record.source_type, record.source_id))
            else:
                source_pairs.append((plan.source_type, plan.source_id))
        goal_by_source = _enrich_goals(db, source_pairs)

        items = []
        for plan, record in occurrences:
            if record is not None:
                # Real occurrence — data from snapshot.
                cs, ms = (
                    compute_streaks(plan, history_by_plan.get(record.plan_id, []), target_date)
                    if plan else (0, 0)
                )
                st, sid = record.source_type, record.source_id
                items.append(DailyPlanItemResponse(
                    plan_id=record.plan_id,
                    source_type=st,
                    source_id=sid,
                    title=record.title,
                    planner_type=record.planner_type,
                    planner_target=record.planner_target,
                    value_unit=record.value_unit,
                    priority=record.priority,
                    preferred_time=record.preferred_time,
                    specific_time=record.specific_time,
                    duration_minutes=record.duration_minutes,
                    goal=goal_by_source.get((st, sid)),
                    saved_data=_record_to_saved_data(record, cs, ms, treat_due_as_missed=True),
                ))
            else:
                # Synthesized missed occurrence — data from current plan.
                cs, ms = compute_streaks(plan, history_by_plan.get(plan.id, []), target_date)
                norm_target, norm_unit = _normalize(
                    plan.planner_type, plan.planner_target, plan.value_unit
                )
                st, sid = plan.source_type, plan.source_id
                items.append(DailyPlanItemResponse(
                    plan_id=plan.id,
                    source_type=st,
                    source_id=sid,
                    title=plan.title,
                    planner_type=plan.planner_type,
                    planner_target=norm_target,
                    value_unit=norm_unit,
                    priority=plan.priority,
                    preferred_time=plan.preferred_time,
                    specific_time=plan.specific_time,
                    duration_minutes=plan.duration_minutes,
                    goal=goal_by_source.get((st, sid)),
                    saved_data=DailyPlanSavedData(
                        record_id=None,
                        status="missed",
                        current_value=0,
                        current_streak=cs,
                        max_streak=ms,
                        note="",
                    ),
                ))

    return DailyPlanResponse(items=items)


def update_daily_record(
    db: Session,
    current_user: UserDBM,
    record_id: int,
    status: str | None,
    actual_value: int | None,
    note: str | None,
) -> DailyPlanSavedData:
    record = db.scalar(
        select(DailyPlanRecordDBM).where(
            DailyPlanRecordDBM.id == record_id,
            DailyPlanRecordDBM.user_id == current_user.id,
        )
    )
    if record is None:
        raise NotFoundError("Daily plan record not found.")

    if record.scheduled_date != date.today():
        raise AppError("Past date records cannot be modified.")

    # For metric plans: actual_value drives status automatically.
    if actual_value is not None and record.planner_type == "metric":
        record.actual_value = actual_value
        target = record.planner_target or 0
        if target > 0 and actual_value >= target:
            record.status = "done"
            if record.completed_at is None:
                record.completed_at = datetime.now(timezone.utc)
        else:
            record.status = "due"
            record.completed_at = None

    # Explicit status always wins (simple plans use this; metric can use too).
    if status is not None:
        record.status = status
        if status == "done":
            if record.planner_type == "simple":
                record.actual_value = 1
            if record.completed_at is None:
                record.completed_at = datetime.now(timezone.utc)
        elif status == "due":
            if record.planner_type == "simple":
                record.actual_value = 0
            record.completed_at = None

    if note is not None:
        record.note = note.strip() or None

    # For task plans: propagate cumulative progress back to the parent Task.
    # Flush first because autoflush=False — without it the sum query would
    # read the stale actual_value from the DB and undercount.
    if record.source_type == "task" and record.source_id is not None:
        db.flush()
        task = db.get(TaskDBM, record.source_id)
        if task is not None:
            total: int = db.scalar(
                select(func.sum(DailyPlanRecordDBM.actual_value)).where(
                    DailyPlanRecordDBM.source_type == "task",
                    DailyPlanRecordDBM.source_id == record.source_id,
                    DailyPlanRecordDBM.user_id == current_user.id,
                )
            ) or 0
            task.current_value = total

    # For schedule plans: mirror record status back to the source ScheduledTask
    # in both directions so the Schedule page always stays in sync.
    if record.source_type == "schedule" and record.source_id is not None:
        sched_task = db.get(ScheduledTaskDBM, record.source_id)
        if sched_task is not None:
            if record.status == "done":
                sched_task.status = "completed"
            elif record.status == "due":
                # Restore to the correct in-progress status: snoozed if the
                # task is past its original date, upcoming if it's still on it.
                sched_task.status = (
                    "snoozed" if date.today() > sched_task.scheduled_date else "upcoming"
                )

    db.commit()
    db.refresh(record)

    # Compute streaks from plan + full history — never persisted.
    cs, ms = 0, 0
    if record.plan_id:
        plan = db.get(PlanDBM, record.plan_id)
        if plan:
            cs, ms = compute_streaks_for_plan(db, plan, record.scheduled_date)

    return _record_to_saved_data(record, cs, ms)
