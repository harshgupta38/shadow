"""Workout sessions: starting from a plan day or freestyle, autosaving while in progress, finishing, and history."""

from datetime import datetime, timezone

from sqlalchemy import or_, select
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
    exercises = []
    for entry in session.exercises:
        previous = recent_done_entries(
            db,
            session.user_id,
            entry.exercise.id,
            before=as_utc(session.started_at),
        )
        previous_sets = (
            [SessionSetResponse(reps=s["reps"], seconds=s.get("seconds"), weight_kg=s["weight_kg"], done=True) for s in previous[0].sets if s["done"]]
            if previous
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


def _accessible_day(db: Session, user: UserDBM, day_id: int) -> WorkoutPlanDayDBM:
    day = db.scalar(
        select(WorkoutPlanDayDBM)
        .join(WorkoutPlanDBM, WorkoutPlanDBM.id == WorkoutPlanDayDBM.plan_id)
        .where(
            WorkoutPlanDayDBM.id == day_id,
            or_(WorkoutPlanDBM.user_id.is_(None), WorkoutPlanDBM.user_id == user.id),
        )
        .options(selectinload(WorkoutPlanDayDBM.exercises))
    )
    if day is None:
        raise NotFoundError("Workout day not found.")
    return day


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


def _close_stale(db: Session, user_id: int, today, now: datetime) -> None:
    """Workouts left running from an earlier day are closed out: kept as completed if any set was logged,
    otherwise discarded. Nothing is shown for them while they are open, so they are settled when the
    user next starts a workout."""
    stale = db.scalars(
        select(WorkoutSessionDBM)
        .where(
            WorkoutSessionDBM.user_id == user_id,
            WorkoutSessionDBM.status == "in_progress",
            WorkoutSessionDBM.session_date < today,
        )
        .options(_SESSION_LOAD)
    ).all()
    for session in stale:
        if session.sets_done > 0:
            session.status = "completed"
            session.finished_at = max(as_utc(session.updated_at), as_utc(session.started_at))
            session.updated_at = now
        else:
            db.delete(session)
    if stale:
        db.flush()


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
    today = today_ist()
    now = now_utc()
    _close_stale(db, user.id, today, now)

    open_session = db.scalar(
        select(WorkoutSessionDBM)
        .where(WorkoutSessionDBM.user_id == user.id, WorkoutSessionDBM.status == "in_progress")
        .options(_SESSION_LOAD)
        .order_by(WorkoutSessionDBM.started_at.desc())
        .limit(1)
    )
    if open_session is not None:
        if open_session.plan_day_id == data.plan_day_id:
            return _session_detail(db, open_session, now)  # same workout again (a double tap, a reopened tab)
        raise ConflictError("Finish or discard your workout in progress before starting another.")

    day = _accessible_day(db, user, data.plan_day_id) if data.plan_day_id is not None else None
    plan = day.plan if day is not None else None
    session = WorkoutSessionDBM(
        user_id=user.id,
        plan_id=plan.id if plan is not None else None,
        plan_day_id=day.id if day is not None else None,
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
