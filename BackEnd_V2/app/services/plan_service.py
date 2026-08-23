"""
Planning engine for the Today Plan feature.

Flow:
    Habit (source)  →  Planning Engine  →  Persisted PlanItem  →  Today Plan API

The planner is DECOUPLED from the Today Plan GET endpoint.
It runs:
  - after habit create  (generate_for_habit)
  - after habit update  (sync_for_habit)
  - after habit delete  (delete_future_for_habit)
  - periodically / background via sync_all_habits (includes marking past items missed)

Transaction contract
────────────────────
Internal helpers (generate_for_habit, sync_for_habit, delete_future_for_habit,
mark_past_items_missed) do NOT commit.  The CALLER owns the transaction and
commits once after all related work is done.  This guarantees atomicity:
e.g. an update_habit + sync_for_habit pair either fully commits or fully
rolls back together.

Standalone operations (sync_all_habits, update_item_status) commit their
own transaction because they are not called inside a larger one.

Idempotency
───────────
generate_for_habit checks existing scheduled_dates before inserting, so
running it multiple times produces the same database state.  The
(user_id, source_type, source_id, scheduled_date) unique constraint backs
this at the DB level as a last-resort guard.

Weekly spread semantics
───────────────────────
"weekly" habits use a deterministic, evenly-distributed day-of-week spread
based on weekly_count.  The mapping is fixed and consistent across all habits
with the same count:

    1 → Monday
    2 → Monday + Thursday
    3 → Monday + Wednesday + Friday
    4 → Monday + Tuesday + Thursday + Friday
    5 → Monday – Friday
    6 → Monday – Saturday

Monthly spread semantics
────────────────────────
"monthly" habits distribute monthly_count occurrences evenly across the month
by dividing it into equal-width slots and picking the midpoint of each slot.
The slot size is days_in_month / monthly_count, and the chosen day is:

    day = int(slot_size * i + slot_size / 2) + 1   for i in 0..count-1

This yields consistent, well-spaced occurrence days for any month length.
"""

import calendar
from datetime import date, timedelta

from sqlalchemy import delete, func, insert as sa_insert, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.habit import HabitDBM
from app.models.plan_item import PlanItemDBM
from app.models.user import UserDBM
from app.schemas.plan_items import PlanDataResponse, PlanStatusUpdateRequest, TodayPlanResponse

# ── Configuration ─────────────────────────────────────────────────────────────

PLANNING_WINDOW_DAYS = 30

# Workload thresholds (total planned minutes for the day).
WORKLOAD_LIGHT_MAX = 60      # < 60 min  → Light
WORKLOAD_MODERATE_MAX = 180  # 60–180 min → Moderate  |  > 180 → Heavy

# ── Internal constants ────────────────────────────────────────────────────────

_PRIORITY_RANK: dict[str, int] = {
    "highest": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
    "lowest": 4,
}

# Maps HabitFrequency day-name strings to Python weekday integers (0=Mon … 6=Sun).
_WEEKDAY_MAP: dict[str, int] = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

# Deterministic spread of occurrences across a week for "weekly" habits.
# Python weekday: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
#
# weekly_count → days of the week the habit occurs
#   1 → Monday
#   2 → Monday + Thursday
#   3 → Monday + Wednesday + Friday
#   4 → Monday + Tuesday + Thursday + Friday
#   5 → Monday – Friday
#   6 → Monday – Saturday
_WEEKLY_SPREAD: dict[int, frozenset[int]] = {
    1: frozenset({0}),
    2: frozenset({0, 3}),
    3: frozenset({0, 2, 4}),
    4: frozenset({0, 1, 3, 4}),
    5: frozenset({0, 1, 2, 3, 4}),
    6: frozenset({0, 1, 2, 3, 4, 5}),
}

# ── Scheduling helpers ────────────────────────────────────────────────────────


def _monthly_occurrence_days(year: int, month: int, count: int) -> frozenset[int]:
    """Return the set of calendar days (1-indexed) where a monthly habit occurs.

    Spreads `count` occurrences evenly across the month by dividing it into
    equal-width slots and picking the midpoint of each slot.

    Example for a 31-day month with count=2:
        step = 15.5
        day 1 = int(0 + 7.75) + 1 = 8
        day 2 = int(15.5 + 7.75) + 1 = 24
    """
    days_in_month = calendar.monthrange(year, month)[1]
    step = days_in_month / count
    return frozenset(
        min(int(step * i + step / 2) + 1, days_in_month)
        for i in range(count)
    )


def _specific_day_occurs(habit: HabitDBM, d: date) -> bool:
    """Return True if `d` is one of the habit's specific_days (with fallback support)."""
    days = habit.specific_days or []
    days_in_month = calendar.monthrange(d.year, d.month)[1]
    if d.day in days:
        return True
    # day_fallback: if a specific day doesn't exist this month, fall to last day of month.
    if habit.day_fallback and d.day == days_in_month:
        return any(day > days_in_month for day in days)
    return False


def habit_occurs_on_date(habit: HabitDBM, d: date) -> bool:
    """Return True if `habit` should generate a PlanItem on date `d`.

    Respects start_date, end_date, and all 14 HabitFrequency variants.
    This function is pure — it does not check habit.status; the caller
    is responsible for skipping paused/archived habits before calling
    the generation loop.
    """
    if habit.start_date and d < habit.start_date:
        return False
    if habit.end_date and d > habit.end_date:
        return False

    for freq in habit.frequencies:
        if freq == "daily":
            return True
        if freq in _WEEKDAY_MAP:
            if d.weekday() == _WEEKDAY_MAP[freq]:
                return True
        elif freq == "weekdays":
            if d.weekday() <= 4:  # Mon–Fri
                return True
        elif freq == "weekends":
            if d.weekday() >= 5:  # Sat–Sun
                return True
        elif freq == "first_of_month":
            if d.day == 1:
                return True
        elif freq == "end_of_month":
            if d.day == calendar.monthrange(d.year, d.month)[1]:
                return True
        elif freq == "specific_day":
            if _specific_day_occurs(habit, d):
                return True
        elif freq == "weekly":
            spread = _WEEKLY_SPREAD.get(habit.weekly_count or 1, frozenset({0}))
            if d.weekday() in spread:
                return True
        elif freq == "monthly":
            occurrence_days = _monthly_occurrence_days(d.year, d.month, habit.monthly_count or 1)
            if d.day in occurrence_days:
                return True

    return False


# ── Workload & ordering ───────────────────────────────────────────────────────


def _calculate_workload(items: list[PlanItemDBM]) -> str:
    """Derive a workload label from the total planned minutes for the day.

    Only `planned` items count toward the total; done/missed are excluded.
    """
    total = sum(
        item.duration_minutes or 0
        for item in items
        if item.status == "planned"
    )
    if total < WORKLOAD_LIGHT_MAX:
        return "Light"
    if total <= WORKLOAD_MODERATE_MAX:
        return "Moderate"
    return "Heavy"


def _sort_items(items: list[PlanItemDBM]) -> list[PlanItemDBM]:
    """Order items: timed items first (ascending), then by priority, then id."""
    return sorted(
        items,
        key=lambda x: (
            x.scheduled_time is None,        # False (0) = has time → sorts first
            x.scheduled_time or "",
            _PRIORITY_RANK.get(x.priority, 5),
            x.id,
        ),
    )


# ── Maintenance ───────────────────────────────────────────────────────────────


def mark_past_items_missed(db: Session, user_id: int, today: date) -> None:
    """Transition all planned items from past dates to `missed`.

    Runs as part of the periodic planning maintenance (called from
    sync_all_habits). Does NOT commit — caller controls the transaction.

    `done` items are never touched: only `planned` past items are affected.
    """
    db.execute(
        update(PlanItemDBM)
        .where(
            PlanItemDBM.user_id == user_id,
            PlanItemDBM.status == "planned",
            PlanItemDBM.scheduled_date < today,
        )
        .values(status="missed")
    )


# ── Core generation / sync ────────────────────────────────────────────────────


def generate_for_habit(
    db: Session,
    habit: HabitDBM,
    today: date,
    window_days: int = PLANNING_WINDOW_DAYS,
) -> None:
    """Generate PlanItems for `habit` from `today` through `today + window_days`.

    Idempotent: queries existing scheduled_dates first and only inserts
    records that are not yet present.  Uses standard SQLAlchemy insert
    (no dialect-specific imports) — works with any RDBMS.

    Does NOT commit — caller controls the transaction.
    Skips generation entirely for paused/archived habits.
    """
    if habit.status != "active":
        return

    end_window = today + timedelta(days=window_days)
    current = today
    rows: list[dict] = []

    while current <= end_window:
        if habit_occurs_on_date(habit, current):
            scheduled_time = (
                habit.specific_time if habit.preferred_time == "custom" else None
            )
            rows.append(
                {
                    "user_id": habit.user_id,
                    "source_type": "habit",
                    "source_id": habit.id,
                    "title": habit.name,
                    "description": habit.motivation,
                    "scheduled_date": current,
                    "scheduled_time": scheduled_time,
                    "duration_minutes": habit.duration_minutes,
                    "priority": habit.priority,
                    "status": "planned",
                    "habit_type": habit.habit_type,
                    "target_value": habit.target_value if habit.habit_type == "metric" else None,
                    "target_unit": habit.target_unit,
                    "time_span": habit.time_span,
                }
            )
        current += timedelta(days=1)

    if not rows:
        return

    # Fetch existing dates for this habit in the candidate window to avoid duplicates.
    # Works within the current (uncommitted) transaction — pending deletes from
    # sync_for_habit are visible here, so freshly cleared slots will be re-filled.
    candidate_dates = [r["scheduled_date"] for r in rows]
    existing_dates = set(
        db.scalars(
            select(PlanItemDBM.scheduled_date).where(
                PlanItemDBM.user_id == habit.user_id,
                PlanItemDBM.source_type == "habit",
                PlanItemDBM.source_id == habit.id,
                PlanItemDBM.scheduled_date.in_(candidate_dates),
            )
        ).all()
    )

    new_rows = [r for r in rows if r["scheduled_date"] not in existing_dates]
    if new_rows:
        db.execute(sa_insert(PlanItemDBM).values(new_rows))


def sync_for_habit(
    db: Session,
    habit: HabitDBM,
    today: date,
    window_days: int = PLANNING_WINDOW_DAYS,
) -> None:
    """Re-synchronize future PlanItems when a habit's configuration changes.

    Deletes all future `planned` items (only), then regenerates from the
    updated habit definition.  Historical `done`/`missed` records are preserved.
    If the habit is now paused/archived, deletion runs but generation is skipped,
    effectively clearing the scheduled future items.

    Does NOT commit — caller controls the transaction.
    """
    db.execute(
        delete(PlanItemDBM).where(
            PlanItemDBM.user_id == habit.user_id,
            PlanItemDBM.source_type == "habit",
            PlanItemDBM.source_id == habit.id,
            PlanItemDBM.status == "planned",
            PlanItemDBM.scheduled_date >= today,
        )
    )
    generate_for_habit(db, habit, today, window_days)


def delete_future_for_habit(db: Session, habit: HabitDBM, today: date) -> None:
    """Remove future `planned` items before a habit is deleted.

    Historical `done`/`missed` records are intentionally kept for history.
    Call this BEFORE deleting the habit row.

    Does NOT commit — caller controls the transaction.
    """
    db.execute(
        delete(PlanItemDBM).where(
            PlanItemDBM.user_id == habit.user_id,
            PlanItemDBM.source_type == "habit",
            PlanItemDBM.source_id == habit.id,
            PlanItemDBM.status == "planned",
            PlanItemDBM.scheduled_date >= today,
        )
    )


def sync_all_habits(
    db: Session,
    user_id: int,
    today: date,
    window_days: int = PLANNING_WINDOW_DAYS,
) -> None:
    """Full planning maintenance pass for a user.

    Steps (all within a single transaction):
      1. Mark any still-planned items from past dates as `missed`.
      2. Generate/fill future plan items for all active habits.

    Idempotent — safe to call repeatedly (e.g. from a background job).
    Commits its own transaction (standalone entry point).
    """
    mark_past_items_missed(db, user_id, today)

    habits = db.scalars(
        select(HabitDBM).where(
            HabitDBM.user_id == user_id,
            HabitDBM.status == "active",
        )
    ).all()
    for habit in habits:
        generate_for_habit(db, habit, today, window_days)

    db.commit()


# ── Status update ─────────────────────────────────────────────────────────────


def update_item_status(
    db: Session,
    current_user: UserDBM,
    item_id: int,
    data: PlanStatusUpdateRequest,
) -> PlanDataResponse:
    """Update the status of a single PlanItem.

    Status changes (planned → done/missed) do NOT affect the originating Habit.
    Commits its own transaction (standalone entry point).
    """
    item = db.scalar(
        select(PlanItemDBM).where(
            PlanItemDBM.id == item_id,
            PlanItemDBM.user_id == current_user.id,
        )
    )
    if item is None:
        raise NotFoundError("Plan item not found.")
    item.status = data.status
    db.commit()
    db.refresh(item)
    return PlanDataResponse.model_validate(item)


# ── Today Plan retrieval ──────────────────────────────────────────────────────


def get_today_plan(
    db: Session,
    current_user: UserDBM,
    query_date: date,
) -> TodayPlanResponse:
    """Return the full Today Plan response for `query_date`.

    Read-only — fetches persisted PlanItems only, does NOT mutate any status.
    Missed-status transitions happen in sync_all_habits / mark_past_items_missed.
    Ordering: timed items first (time ASC), then priority, then id.
    """
    items = list(
        db.scalars(
            select(PlanItemDBM).where(
                PlanItemDBM.user_id == current_user.id,
                PlanItemDBM.scheduled_date == query_date,
            )
        ).all()
    )
    sorted_items = _sort_items(items)

    yesterday = query_date - timedelta(days=1)
    missed_yesterday_count: int = db.scalar(
        select(func.count()).select_from(PlanItemDBM).where(
            PlanItemDBM.user_id == current_user.id,
            PlanItemDBM.scheduled_date == yesterday,
            PlanItemDBM.status == "missed",
        )
    ) or 0

    return TodayPlanResponse(
        date=query_date,
        items=[PlanDataResponse.model_validate(item) for item in sorted_items],
        missed_yesterday_count=missed_yesterday_count,
        carry_forward_count=0,
        workload_label=_calculate_workload(sorted_items),
    )
