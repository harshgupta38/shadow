"""Exercise library lookups, plus the lookups that read a user's own history of an exercise."""

from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, contains_eager, selectinload

from app.core.exceptions import NotFoundError
from app.models.workout import WorkoutExerciseDBM, WorkoutSessionDBM, WorkoutSessionExerciseDBM
from app.schemas.workout import ExerciseDetailResponse, ExercisePerformanceResponse, ExerciseSummaryResponse

_HISTORY_SCAN_LIMIT = 20  # recent entries inspected when looking for one with done sets


def exercise_summary(exercise: WorkoutExerciseDBM) -> ExerciseSummaryResponse:
    return ExerciseSummaryResponse(
        id=exercise.id,
        name=exercise.name,
        image_url=exercise.images[0] if exercise.images else None,
        primary_muscles=exercise.primary_muscles,
        secondary_muscles=exercise.secondary_muscles,
        equipment=exercise.equipment,
        level=exercise.level,
        mechanic=exercise.mechanic,
        kind=exercise.kind,
    )


def library_by_id(db: Session, exercise_ids: Iterable[int]) -> dict[int, WorkoutExerciseDBM]:
    wanted = set(exercise_ids)
    if not wanted:
        return {}
    rows = db.scalars(select(WorkoutExerciseDBM).where(WorkoutExerciseDBM.id.in_(wanted))).all()
    return {row.id: row for row in rows}


def list_exercises(db: Session) -> list[ExerciseSummaryResponse]:
    rows = db.scalars(select(WorkoutExerciseDBM).order_by(WorkoutExerciseDBM.position, WorkoutExerciseDBM.id)).all()
    return [exercise_summary(row) for row in rows]


def recent_done_entries(
    db: Session,
    user_id: int,
    exercise_id: int,
    *,
    before: datetime | None = None,
    limit: int = 1,
) -> list[WorkoutSessionExerciseDBM]:
    """The most recent completed entries of an exercise that have at least one done set, newest first."""
    query = (
        select(WorkoutSessionExerciseDBM)
        .join(WorkoutSessionExerciseDBM.session)
        .where(
            WorkoutSessionDBM.user_id == user_id,
            WorkoutSessionDBM.status == "completed",
            WorkoutSessionExerciseDBM.exercise_id == exercise_id,
        )
        .options(contains_eager(WorkoutSessionExerciseDBM.session), selectinload(WorkoutSessionExerciseDBM.sets))
        .order_by(WorkoutSessionDBM.started_at.desc(), WorkoutSessionDBM.id.desc())
        .limit(_HISTORY_SCAN_LIMIT)
    )
    if before is not None:
        query = query.where(WorkoutSessionDBM.started_at < before)

    found: list[WorkoutSessionExerciseDBM] = []
    for entry in db.scalars(query).all():
        if any(s.done for s in entry.sets):
            found.append(entry)
            if len(found) == limit:
                break
    return found


def last_performance(db: Session, user_id: int, exercise_id: int) -> ExercisePerformanceResponse | None:
    entries = recent_done_entries(db, user_id, exercise_id)
    if not entries:
        return None
    entry = entries[0]
    done = [s for s in entry.sets if s.done]
    best = max(done, key=lambda s: (s.weight_kg or 0, s.reps or 0))
    return ExercisePerformanceResponse(
        date=entry.session.session_date,
        weight_kg=best.weight_kg,
        reps=best.reps,
        sets=len(done),
    )


def _overlap_score(a: WorkoutExerciseDBM, b: WorkoutExerciseDBM) -> int:
    """How much two exercises train the same muscles. A shared primary muscle counts double."""
    a_primary, b_primary = set(a.primary_muscles), set(b.primary_muscles)
    return (
        2 * len(a_primary & b_primary)
        + len(a_primary & set(b.secondary_muscles))
        + len(set(a.secondary_muscles) & b_primary)
    )


def _scored_matches(
    db: Session,
    exercise: WorkoutExerciseDBM,
    kinds: tuple[str, ...],
    levels: tuple[str, ...] | None = None,
) -> list[tuple[int, WorkoutExerciseDBM]]:
    """Other library items of the given kinds, best muscle match first. Ties keep the library's order."""
    query = select(WorkoutExerciseDBM).where(
        WorkoutExerciseDBM.kind.in_(kinds),
        WorkoutExerciseDBM.id != exercise.id,
    )
    if levels is not None:
        query = query.where(WorkoutExerciseDBM.level.in_(levels))
    scored = [(_overlap_score(exercise, item), item) for item in db.scalars(query).all()]
    scored.sort(key=lambda pair: (-pair[0], pair[1].position, pair[1].name))
    return scored


_GENERAL_CARDIO = "brisk-walk"  # the warm-up when no cardio works the same muscles as the lift


def _warm_up_with(db: Session, exercise: WorkoutExerciseDBM) -> list[ExerciseSummaryResponse]:
    """Before a lift: a cardio that works one of its primary muscles (or a brisk walk), then up to three drills."""
    if exercise.kind != "strength":
        return []
    cardio = [pair for pair in _scored_matches(db, exercise, ("cardio",)) if pair[1].level != "advanced"]
    matched = [pair for pair in cardio if pair[0] >= 2]
    general = [pair for pair in cardio if pair[1].slug == _GENERAL_CARDIO]
    pick = (matched or general)[:1]  # empty when the library has no cardio, rather than failing
    drills = [pair for pair in _scored_matches(db, exercise, ("warmup",)) if pair[0] > 0][:3]
    return [exercise_summary(item) for _, item in pick + drills]


def _good_warm_up_for(db: Session, exercise: WorkoutExerciseDBM) -> list[ExerciseSummaryResponse]:
    """The lifts a cardio or warm-up item prepares: those training one of its primary muscles, strongest first."""
    if exercise.kind == "strength" or exercise.level == "advanced":
        return []
    lifts = [pair for pair in _scored_matches(db, exercise, ("strength",)) if pair[0] >= 2][:6]
    return [exercise_summary(item) for _, item in lifts]


def get_exercise(db: Session, user_id: int, exercise_id: int) -> ExerciseDetailResponse:
    exercise = db.get(WorkoutExerciseDBM, exercise_id)
    if exercise is None:
        raise NotFoundError("Exercise not found.")
    return ExerciseDetailResponse(
        **exercise_summary(exercise).model_dump(),
        description=exercise.description,
        image_urls=list(exercise.images),
        instructions=exercise.instructions,
        tips=exercise.tips,
        common_mistakes=exercise.common_mistakes,
        default_sets=exercise.default_sets,
        default_reps=exercise.default_reps,
        default_rest_seconds=exercise.default_rest_seconds,
        last_performance=last_performance(db, user_id, exercise_id),
        warm_up_with=_warm_up_with(db, exercise),
        good_warm_up_for=_good_warm_up_for(db, exercise),
    )
