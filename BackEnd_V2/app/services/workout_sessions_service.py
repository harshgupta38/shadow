"""Workout sessions: starting from a plan day or freestyle, autosaving while in progress, finishing, and history."""

from datetime import datetime, timezone

from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.common import today_ist
from app.common.workout import SECONDARY_CREDIT, as_utc
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.user import UserDBM
from app.models.workout import (
    WorkoutExerciseDBM,
    WorkoutPlanDayDBM,
    WorkoutPlanDBM,
    WorkoutSessionDBM,
    WorkoutSessionExerciseDBM,
)
from app.schemas.workout import (
    SessionSaveRequest,
    SessionSetResponse,
    SessionExerciseResponse,
    SessionStartRequest,
    WorkoutSessionDetailResponse,
    WorkoutSessionSummaryResponse,
)
from app.services.workout_library_service import exercise_summary, library_by_id, recent_done_entries

_DEFAULT_NAME = "Quick workout"

_SESSION_LOAD = selectinload(WorkoutSessionDBM.exercises)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def duration_seconds(session: WorkoutSessionDBM, now: datetime) -> int:
    end = as_utc(session.finished_at) if session.finished_at else now
    return max(0, int((end - as_utc(session.started_at)).total_seconds()))


def session_summary(session: WorkoutSessionDBM, now: datetime) -> WorkoutSessionSummaryResponse:
    return WorkoutSessionSummaryResponse(
        id=session.id,
        name=session.name,
        date=session.session_date,
        status=session.status,
        plan_name=session.plan_name,
        duration_seconds=duration_seconds(session, now),
        exercise_count=session.exercise_count,
        sets_done=session.sets_done,
        volume_kg=session.volume_kg,
        muscles=session.muscles,
    )


def _session_detail(db: Session, session: WorkoutSessionDBM, now: datetime) -> WorkoutSessionDetailResponse:
    # One query finds the previous workout of every exercise in this session.
    previous = recent_done_entries(
        db,
        session.user_id,
        [entry.exercise.id for entry in session.exercises],
        before=as_utc(session.started_at),
    )
    exercises = []
    for entry in session.exercises:
        last = previous.get(entry.exercise.id)
        # One entry per set of the previous session, in order, so the frontend can read them by set position.
        previous_sets = (
            [
                SessionSetResponse(reps=s["reps"], seconds=s.get("seconds"), weight_kg=s["weight_kg"], done=True)
                if s["done"] else SessionSetResponse(reps=None, seconds=None, weight_kg=None, done=False)
                for s in last.sets
            ]
            if last is not None
            else []
        )
        exercises.append(
            SessionExerciseResponse(
                id=entry.id,
                exercise=exercise_summary(entry.exercise),
                target_sets=entry.target_sets,
                target_reps=entry.target_reps,
                rest_seconds=entry.rest_seconds,
                note=entry.note,
                sets=[SessionSetResponse(reps=s["reps"], seconds=s.get("seconds"), weight_kg=s["weight_kg"], done=s["done"]) for s in entry.sets],
                previous_sets=previous_sets,
            )
        )

    return WorkoutSessionDetailResponse(
        **session_summary(session, now).model_dump(),
        plan_id=session.plan_id,
        plan_day_id=session.plan_day_id,
        started_at=as_utc(session.started_at),
        note=session.note,
        exercises=exercises,
    )


def _owned_session(db: Session, user: UserDBM, session_id: int) -> WorkoutSessionDBM:
    session = db.scalar(
        select(WorkoutSessionDBM)
        .where(WorkoutSessionDBM.id == session_id, WorkoutSessionDBM.user_id == user.id)
        .options(_SESSION_LOAD)
        .execution_options(populate_existing=True)
    )
    if session is None:
        raise NotFoundError("Workout not found.")
    return session


def _ensure_open(session: WorkoutSessionDBM) -> None:
    if session.status != "in_progress":
        raise ConflictError("This workout is already finished.")


def _accessible_day(db: Session, user: UserDBM, day_id: int) -> WorkoutPlanDayDBM | None:
    return db.scalar(
        select(WorkoutPlanDayDBM)
        .join(WorkoutPlanDBM, WorkoutPlanDBM.id == WorkoutPlanDayDBM.plan_id)
        .where(
            WorkoutPlanDayDBM.id == day_id,
            or_(WorkoutPlanDBM.user_id.is_(None), WorkoutPlanDBM.user_id == user.id),
        )
        .options(selectinload(WorkoutPlanDayDBM.exercises))
    )


def _refresh_totals(session: WorkoutSessionDBM) -> None:
    sets_done = 0
    volume = 0.0
    muscles: list[str] = []
    credit: dict[str, float] = {}
    for entry in session.exercises:
        done = [s for s in entry.sets if s["done"]]
        if not done:
            continue
        sets_done += len(done)
        if entry.exercise.kind != "strength":
            continue  # cardio and warm-ups count toward the workout, not toward strength volume or muscle credit
        volume += sum((s["weight_kg"] or 0) * (s["reps"] or 0) for s in done)
        for muscle in entry.exercise.primary_muscles:
            if muscle not in muscles:
                muscles.append(muscle)
            credit[muscle] = credit.get(muscle, 0) + len(done)
        for muscle in entry.exercise.secondary_muscles:
            credit[muscle] = credit.get(muscle, 0) + len(done) * SECONDARY_CREDIT

    session.exercise_count = len(session.exercises)
    session.sets_done = sets_done
    session.volume_kg = round(volume, 1)
    session.muscles = muscles
    session.muscle_sets = {muscle: round(value, 2) for muscle, value in credit.items()}


def _apply_save(db: Session, session: WorkoutSessionDBM, data: SessionSaveRequest) -> None:
    """Replace the session's exercises and sets with what the client sent, keeping the client's order."""
    library = library_by_id(db, [item.exercise_id for item in data.exercises])
    if {item.exercise_id for item in data.exercises} - library.keys():
        message = "Some exercises are no longer in the library."
        raise ValidationError(message, errors={"exercises": message})

    existing = {entry.id: entry for entry in session.exercises}
    used: set[int] = set()
    entries: list[WorkoutSessionExerciseDBM] = []
    for position, item in enumerate(data.exercises):
        entry = existing.get(item.id) if item.id is not None and item.id not in used else None
        exercise = library[item.exercise_id]
        if entry is None:
            entry = WorkoutSessionExerciseDBM(
                target_sets=max(1, len(item.sets)),
                target_reps=exercise.default_reps,
                rest_seconds=exercise.default_rest_seconds,
            )
        else:
            used.add(entry.id)
        entry.exercise = exercise
        entry.position = position
        entry.note = item.note
        entry.sets = [{"reps": s.reps, "seconds": s.seconds, "weight_kg": s.weight_kg, "done": s.done} for s in item.sets]
        entries.append(entry)

    session.exercises = entries  # entries that were dropped from the list are deleted with it
    session.note = data.note
    _refresh_totals(session)


def settle_open_sessions(db: Session, sessions: list[WorkoutSessionDBM], now: datetime) -> None:
    """Workouts left running are closed out: kept as completed if any set was logged, otherwise discarded.
    Nothing is shown for them while they are open, so they are settled when the user next starts a workout."""
    for session in sessions:
        if session.sets_done > 0:
            session.status = "completed"
            session.finished_at = max(as_utc(session.updated_at), as_utc(session.started_at))
            session.updated_at = now
        else:
            db.delete(session)
    if sessions:
        db.flush()


def _close_stale(db: Session, user_id: int, today, now: datetime) -> None:
    """Settles the workouts left running from an earlier day (see settle_open_sessions)."""
    stale = db.scalars(
        select(WorkoutSessionDBM)
        .where(
            WorkoutSessionDBM.user_id == user_id,
            WorkoutSessionDBM.status == "in_progress",
            WorkoutSessionDBM.session_date < today,
        )
        .options(_SESSION_LOAD)
    ).all()
    settle_open_sessions(db, stale, now)


def _open_query(user_id: int):
    """The user's open workouts, newest first. The newest is the one a start returns."""
    return (
        select(WorkoutSessionDBM)
        .where(WorkoutSessionDBM.user_id == user_id, WorkoutSessionDBM.status == "in_progress")
        .options(_SESSION_LOAD)
        .order_by(WorkoutSessionDBM.started_at.desc(), WorkoutSessionDBM.id.desc())
    )


def _newest_open(db: Session, user_id: int) -> WorkoutSessionDBM | None:
    return db.scalar(_open_query(user_id).limit(1))


def settle_duplicate_open_sessions(db: Session, now: datetime) -> None:
    """Keeps each user's newest open workout and settles the others the same way. Used once, when a database is
    upgraded to allow a single open workout per user."""
    user_ids = db.scalars(
        select(WorkoutSessionDBM.user_id)
        .where(WorkoutSessionDBM.status == "in_progress")
        .group_by(WorkoutSessionDBM.user_id)
        .having(func.count() > 1)
    ).all()
    for user_id in user_ids:
        newest_first = db.scalars(_open_query(user_id)).all()
        settle_open_sessions(db, newest_first[1:], now)


def _is_same_workout(open_session: WorkoutSessionDBM, day: WorkoutPlanDayDBM | None) -> bool:
    """Whether a start asks for the workout that is already open. A start that names no plan day (day is None) is
    freestyle, and only an open freestyle workout matches it. A plan day matches the open workout started from the same
    weekday of the same plan, however that plan's days were rebuilt since."""
    if day is None:
        return open_session.plan_name is None
    return open_session.plan_id == day.plan_id and open_session.plan_weekday == day.weekday


def list_sessions(db: Session, user: UserDBM, limit: int, offset: int) -> list[WorkoutSessionSummaryResponse]:
    rows = db.scalars(
        select(WorkoutSessionDBM)
        .where(WorkoutSessionDBM.user_id == user.id, WorkoutSessionDBM.status == "completed")
        .order_by(
            WorkoutSessionDBM.session_date.desc(),
            WorkoutSessionDBM.started_at.desc(),
            WorkoutSessionDBM.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    ).all()
    now = now_utc()
    return [session_summary(row, now) for row in rows]


def get_session(db: Session, user: UserDBM, session_id: int) -> WorkoutSessionDetailResponse:
    session = _owned_session(db, user, session_id)
    return _session_detail(db, session, now_utc())


def start_session(db: Session, user: UserDBM, data: SessionStartRequest) -> WorkoutSessionDetailResponse:
    try:
        return _start(db, user, data)
    except IntegrityError:
        # A start that did not take the write lock (an older worker still running) committed its open workout first,
        # and the partial unique index refused this one. Rolled back, the check in _start sees that workout.
        db.rollback()
        return _start(db, user, data)


def _start(db: Session, user: UserDBM, data: SessionStartRequest) -> WorkoutSessionDetailResponse:
    # Taking the write lock first makes the stale check, the open-workout check and the insert one step, so starts take
    # turns. Without it, two starts could settle the same stale row, and the second delete could hit the workout the
    # first one just created, because SQLite reuses the id of a deleted last row. The session must not have a write
    # transaction open yet, which a request's session does not have when it gets here.
    db.execute(text("BEGIN IMMEDIATE"))
    today = today_ist()
    now = now_utc()
    _close_stale(db, user.id, today, now)

    day = _accessible_day(db, user, data.plan_day_id) if data.plan_day_id is not None else None
    if data.plan_day_id is not None and day is None:
        raise NotFoundError("Workout day not found.")  # a missing day is not a conflict, even with a workout open
    open_session = _newest_open(db, user.id)
    if open_session is not None:
        if _is_same_workout(open_session, day):
            return _session_detail(db, open_session, now)  # same workout again (a double tap, a reopened tab)
        raise ConflictError("Finish or discard your workout in progress before starting another.")

    plan = day.plan if day is not None else None
    session = WorkoutSessionDBM(
        user_id=user.id,
        plan_id=plan.id if plan is not None else None,
        plan_day_id=day.id if day is not None else None,
        plan_weekday=day.weekday if day is not None else None,
        plan_name=plan.name if plan is not None else None,
        name=(data.name or "").strip() or (day.name if day is not None else _DEFAULT_NAME),
        session_date=today,
        status="in_progress",
        started_at=now,
        updated_at=now,
    )
    library: dict[int, WorkoutExerciseDBM] = {}
    if day is not None:
        library = library_by_id(db, [planned.exercise_id for planned in day.exercises])
        for position, planned in enumerate(day.exercises):
            session.exercises.append(
                WorkoutSessionExerciseDBM(
                    position=position,
                    exercise=library[planned.exercise_id],
                    target_sets=planned.sets,
                    target_reps=planned.reps,
                    rest_seconds=planned.rest_seconds,
                    note=planned.note,
                    sets=[{"reps": None, "seconds": None, "weight_kg": planned.weight_kg, "done": False} for _ in range(planned.sets)],
                )
            )
    _refresh_totals(session)
    db.add(session)
    db.commit()
    return _session_detail(db, session, now)


def save_session(db: Session, user: UserDBM, session_id: int, data: SessionSaveRequest) -> WorkoutSessionDetailResponse:
    session = _owned_session(db, user, session_id)
    _ensure_open(session)
    _apply_save(db, session, data)
    now = now_utc()
    session.updated_at = now
    db.commit()
    return _session_detail(db, session, now)


def finish_session(db: Session, user: UserDBM, session_id: int, data: SessionSaveRequest) -> WorkoutSessionDetailResponse:
    session = _owned_session(db, user, session_id)
    _ensure_open(session)
    _apply_save(db, session, data)
    now = now_utc()
    session.status = "completed"
    session.finished_at = now
    session.updated_at = now
    db.commit()
    return _session_detail(db, session, now)


def delete_session(db: Session, user: UserDBM, session_id: int) -> None:
    db.delete(_owned_session(db, user, session_id))
    db.commit()
