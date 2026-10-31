"""Numbers for the Today and History tabs: this week, the last few weeks, muscle balance and personal records."""

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta

from sqlalchemy import Date, Integer, cast, func, select
from sqlalchemy.orm import Session

from app.common import today_ist
from app.common.workout import sunday_based_weekday, week_start
from app.models.user import UserDBM
from app.models.workout import WorkoutSessionDBM, WorkoutSessionExerciseDBM
from app.schemas.workout import (
    MuscleSetsResponse,
    PersonalRecordResponse,
    WorkoutOverviewResponse,
    WorkoutProgressResponse,
    WorkoutProgressWeekResponse,
    WorkoutWeekDayResponse,
)
from app.services import workout_plans_service, workout_sessions_service
from app.services.workout_library_service import exercise_summary, library_by_id

MUSCLE_WINDOW_DAYS = 30
RECORD_COUNT = 5


def _completed(db: Session, user_id: int, *clauses) -> list[WorkoutSessionDBM]:
    return list(
        db.scalars(
            select(WorkoutSessionDBM).where(
                WorkoutSessionDBM.user_id == user_id,
                WorkoutSessionDBM.status == "completed",
                *clauses,
            )
        ).all()
    )


def _minutes(sessions: Iterable, now) -> int:
    """Minutes across sessions. Each needs started_at and finished_at, so full rows and column rows both work."""
    seconds = sum(workout_sessions_service.duration_seconds(s, now) for s in sessions)
    return int(seconds / 60 + 0.5)


def _muscle_rows(sessions: Iterable) -> list[MuscleSetsResponse]:
    totals: defaultdict[str, float] = defaultdict(float)
    for session in sessions:
        for muscle, sets in session.muscle_sets.items():
            totals[muscle] += sets
    ranked = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    return [MuscleSetsResponse(muscle=muscle, sets=round(sets, 2)) for muscle, sets in ranked]


def overview(db: Session, user: UserDBM) -> WorkoutOverviewResponse:
    today = today_ist()
    now = workout_sessions_service.now_utc()
    start = week_start(today)
    end = start + timedelta(days=6)

    plan = workout_plans_service.active_plan(db, user)
    started_on = workout_plans_service.active_plan_started_on(db, user.id)
    scheduled = {day.weekday: day for day in plan.days} if plan is not None else {}
    plan_day = scheduled.get(sunday_based_weekday(today))

    this_week = _completed(
        db,
        user.id,
        WorkoutSessionDBM.session_date >= start,
        WorkoutSessionDBM.session_date <= end,
    )
    done_today = sorted(
        (s for s in this_week if s.session_date == today),
        key=lambda s: s.started_at,
        reverse=True,
    )
    open_today = db.scalar(
        select(WorkoutSessionDBM)
        .where(
            WorkoutSessionDBM.user_id == user.id,
            WorkoutSessionDBM.status == "in_progress",
            WorkoutSessionDBM.session_date == today,
        )
        .order_by(WorkoutSessionDBM.started_at.desc())
        .limit(1)
    )

    week = []
    for offset in range(7):
        day = start + timedelta(days=offset)
        logged = [s for s in this_week if s.session_date == day]
        # Days before the plan was followed have nothing planned, so they read as rest rather than missed.
        planned = scheduled.get(offset) if started_on is None or day >= started_on else None
        if logged:
            status = "done"
        elif planned is None:
            status = "rest"
        elif day < today:
            status = "missed"
        elif day == today:
            status = "today"
        else:
            status = "upcoming"
        label = planned.name if planned is not None else (logged[0].name if logged else None)
        week.append(WorkoutWeekDayResponse(date=day, weekday=offset, label=label, status=status))

    return WorkoutOverviewResponse(
        active_plan=workout_plans_service.plan_summary(plan, plan.id) if plan is not None else None,
        today_date=today,
        today_plan_day=workout_plans_service.day_response(plan_day) if plan_day is not None else None,
        is_rest_day=plan is not None and plan_day is None,
        in_progress_session_id=open_today.id if open_today is not None else None,
        completed_today=workout_sessions_service.session_summary(done_today[0], now) if done_today else None,
        week=week,
        sessions_this_week=len(this_week),
        sessions_target=len(plan.days) if plan is not None else 0,
        volume_kg_week=round(sum(s.volume_kg for s in this_week), 1),
        minutes_week=_minutes(this_week, now),
        muscles_this_week=_muscle_rows(this_week),
    )


def _personal_records(db: Session, user_id: int) -> list[PersonalRecordResponse]:
    """The best set per exercise (heaviest, then most reps), newest records first."""
    rows = db.execute(
        select(WorkoutSessionExerciseDBM.exercise_id, WorkoutSessionExerciseDBM.sets, WorkoutSessionDBM.session_date)
        .join(WorkoutSessionDBM, WorkoutSessionDBM.id == WorkoutSessionExerciseDBM.session_id)
        .where(WorkoutSessionDBM.user_id == user_id, WorkoutSessionDBM.status == "completed")
    ).all()

    best: dict[int, tuple[float, int, date]] = {}
    for exercise_id, sets, day in rows:
        for s in sets:
            if s["done"] and (s["weight_kg"] or 0) > 0 and (s["reps"] or 0) > 0:
                candidate = (s["weight_kg"], s["reps"], day)
                current = best.get(exercise_id)
                if current is None or candidate > current:
                    best[exercise_id] = candidate

    newest = sorted(best.items(), key=lambda item: item[1][2], reverse=True)[:RECORD_COUNT]
    library = library_by_id(db, [exercise_id for exercise_id, _ in newest])
    return [
        PersonalRecordResponse(
            exercise=exercise_summary(library[exercise_id]),
            weight_kg=weight,
            reps=reps,
            date=day,
        )
        for exercise_id, (weight, reps, day) in newest
    ]


def _week_start_sql():
    """The Sunday that opens each session's week, computed the way week_start() does it (strftime %w: 0 = Sunday)."""
    session_date = WorkoutSessionDBM.session_date
    return func.date(session_date, func.printf("-%d days", cast(func.strftime("%w", session_date), Integer)), type_=Date)


def progress(db: Session, user: UserDBM, weeks: int) -> WorkoutProgressResponse:
    today = today_ist()
    now = workout_sessions_service.now_utc()
    current = week_start(today)
    first = current - timedelta(days=7 * (weeks - 1))
    month_ago = today - timedelta(days=MUSCLE_WINDOW_DAYS)

    # Only sessions inside the weeks shown or the muscle window are read, and only the columns those need.
    recent = db.execute(
        select(
            WorkoutSessionDBM.session_date,
            WorkoutSessionDBM.volume_kg,
            WorkoutSessionDBM.started_at,
            WorkoutSessionDBM.finished_at,
            WorkoutSessionDBM.muscle_sets,
        ).where(
            WorkoutSessionDBM.user_id == user.id,
            WorkoutSessionDBM.status == "completed",
            WorkoutSessionDBM.session_date >= min(first, month_ago),
        )
    ).all()
    in_window = [row for row in recent if row.session_date >= first]

    week_rows = []
    for index in range(weeks):
        start = first + timedelta(days=7 * index)
        end = start + timedelta(days=6)
        inside = [row for row in in_window if start <= row.session_date <= end]
        week_rows.append(
            WorkoutProgressWeekResponse(
                week_start=start,
                sessions=len(inside),
                volume_kg=round(sum(row.volume_kg for row in inside), 1),
                minutes=_minutes(inside, now),
            )
        )

    # Consecutive weeks with at least one workout, counted back from this week. An empty current week
    # does not break the streak, since it may simply be early in the week. SQL returns each week once.
    weeks_with_sessions = set(
        db.scalars(
            select(_week_start_sql())
            .where(WorkoutSessionDBM.user_id == user.id, WorkoutSessionDBM.status == "completed")
            .distinct()
        ).all()
    )
    cursor = current if current in weeks_with_sessions else current - timedelta(days=7)
    streak = 0
    while cursor in weeks_with_sessions:
        streak += 1
        cursor -= timedelta(days=7)

    total_sessions = db.scalar(
        select(func.count())
        .select_from(WorkoutSessionDBM)
        .where(WorkoutSessionDBM.user_id == user.id, WorkoutSessionDBM.status == "completed")
    )
    return WorkoutProgressResponse(
        weeks=week_rows,
        muscles=_muscle_rows([row for row in recent if row.session_date >= month_ago]),
        personal_records=_personal_records(db, user.id),  # needs every completed set, so it keeps the full history
        total_sessions=total_sessions,
        current_streak_weeks=streak,
    )
