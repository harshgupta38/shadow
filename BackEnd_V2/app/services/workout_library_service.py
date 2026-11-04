"""Exercise library lookups, plus the lookups that read a user's own history of an exercise."""

from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, contains_eager, defer

from app.core.exceptions import NotFoundError
from app.models.workout_exercise import WorkoutExerciseDBM
from app.models.workout_session import WorkoutSessionDBM
from app.models.workout_session_exercise import WorkoutSessionExerciseDBM
from app.schemas.workout import (
    ExerciseDetailResponse,
    ExercisePerformanceResponse,
    ExerciseSummaryResponse,
    WarmUpItemResponse,
    WarmUpRoutineResponse,
)
from app.services.workout_calc_service import timed_amount, warm_up_seconds
from app.services.workout_media_service import media_url, thumbnail_url

_HISTORY_SCAN_LIMIT = 20  # recent entries inspected when looking for one with done sets


def exercise_summary(exercise: WorkoutExerciseDBM) -> ExerciseSummaryResponse:
    return ExerciseSummaryResponse(
        id=exercise.id,
        name=exercise.name,
        image_url=thumbnail_url(exercise.slug) if exercise.images else None,
        primary_muscles=exercise.primary_muscles,
        secondary_muscles=exercise.secondary_muscles,
        equipment=exercise.equipment,
        equipment_type=exercise.equipment_type,
        level=exercise.level,
        mechanic=exercise.mechanic,
        kind=exercise.kind,
        measure=exercise.measure,
        default_sets=exercise.default_sets,
        default_reps=exercise.default_reps,
        default_rest_seconds=exercise.default_rest_seconds,
    )


def library_by_id(db: Session, exercise_ids: Iterable[int]) -> dict[int, WorkoutExerciseDBM]:
    wanted = set(exercise_ids)
    if not wanted:
        return {}
    rows = db.scalars(select(WorkoutExerciseDBM).where(WorkoutExerciseDBM.id.in_(wanted))).all()
    return {row.id: row for row in rows}


def list_exercises(db: Session) -> list[ExerciseSummaryResponse]:
    # The list shows only summary fields, so the long text columns are left out of the query.
    rows = db.scalars(
        select(WorkoutExerciseDBM)
        .options(
            defer(WorkoutExerciseDBM.description),
            defer(WorkoutExerciseDBM.instructions),
            defer(WorkoutExerciseDBM.tips),
            defer(WorkoutExerciseDBM.common_mistakes),
        )
        .order_by(WorkoutExerciseDBM.position, WorkoutExerciseDBM.id)
    ).all()
    return [exercise_summary(row) for row in rows]


def recent_done_entries(
    db: Session,
    user_id: int,
    exercise_ids: Iterable[int],
    *,
    before: datetime | None = None,
) -> dict[int, WorkoutSessionExerciseDBM]:
    """For each exercise, its most recent completed entry with at least one done set. Only the last
    _HISTORY_SCAN_LIMIT entries of each exercise are inspected. One query serves every exercise."""
    wanted = set(exercise_ids)
    if not wanted:
        return {}
    # Number each exercise's completed entries newest first, before the cut-off, so the scan limit applies per exercise.
    numbered = (
        select(
            WorkoutSessionExerciseDBM.id.label("entry_id"),
            func.row_number()
            .over(
                partition_by=WorkoutSessionExerciseDBM.exercise_id,
                order_by=(WorkoutSessionDBM.started_at.desc(), WorkoutSessionDBM.id.desc()),
            )
            .label("recency"),
        )
        .join(WorkoutSessionExerciseDBM.session)
        .where(
            WorkoutSessionDBM.user_id == user_id,
            WorkoutSessionDBM.status == "completed",
            WorkoutSessionExerciseDBM.exercise_id.in_(wanted),
        )
    )
    if before is not None:
        numbered = numbered.where(WorkoutSessionDBM.started_at < before)
    numbered = numbered.subquery()

    rows = db.scalars(
        select(WorkoutSessionExerciseDBM)
        .join(numbered, numbered.c.entry_id == WorkoutSessionExerciseDBM.id)
        .join(WorkoutSessionExerciseDBM.session)
        .where(numbered.c.recency <= _HISTORY_SCAN_LIMIT)
        .options(contains_eager(WorkoutSessionExerciseDBM.session))
        .order_by(WorkoutSessionExerciseDBM.exercise_id, numbered.c.recency)
    ).all()
    found: dict[int, WorkoutSessionExerciseDBM] = {}
    for entry in rows:
        if entry.exercise_id not in found and any(s["done"] for s in entry.sets):
            found[entry.exercise_id] = entry
    return found


def last_performance(db: Session, user_id: int, exercise_id: int) -> ExercisePerformanceResponse | None:
    entry = recent_done_entries(db, user_id, [exercise_id]).get(exercise_id)
    if entry is None:
        return None
    done = [s for s in entry.sets if s["done"]]
    best = max(done, key=lambda s: (s["weight_kg"] or 0, s["reps"] or 0, s.get("seconds") or 0))
    return ExercisePerformanceResponse(
        date=entry.session.session_date,
        weight_kg=best["weight_kg"],
        reps=best["reps"],
        seconds=best.get("seconds"),
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


def warm_ups_for(db: Session, lifts: Iterable[WorkoutExerciseDBM]) -> list[ExerciseSummaryResponse]:
    """The warm-ups for a day's exercises: each lift's own warm-up (see _warm_up_with), without repeats, in lift order."""
    seen: set[int] = set()
    warm_ups: list[ExerciseSummaryResponse] = []
    for lift in lifts:
        for item in _warm_up_with(db, lift):
            if item.id not in seen:
                seen.add(item.id)
                warm_ups.append(item)
    return warm_ups


_ROUTINE_CARDIO_MINUTES = 5  # a pulse-raiser, not a cardio session
_ROUTINE_DRILLS = 5


def _routine_dose(item: ExerciseSummaryResponse) -> tuple[int, str]:
    """The library's own dose, except that a timed cardio block is cut to the length of a warm-up."""
    minutes = timed_amount(item.default_reps, "min")
    if item.kind == "cardio" and minutes is not None:
        return 1, f"{min(minutes, _ROUTINE_CARDIO_MINUTES)} min"
    return item.default_sets, item.default_reps


def warm_up_routine_for(db: Session, lifts: Iterable[WorkoutExerciseDBM], skip_ids: Iterable[int] = ()) -> WarmUpRoutineResponse:
    """A short warm-up to do before a day's lifts: one cardio pulse-raiser, then a few drills. Each lift contributes its own
    picks (see _warm_up_with) and an item that prepares more of the day's lifts ranks higher. Dynamic drills come before
    static holds, which are a poor fit before lifting. Ties keep the lifts' order."""
    skip = set(skip_ids)
    cardio_votes: dict[int, int] = {}
    drill_votes: dict[int, int] = {}
    items: dict[int, ExerciseSummaryResponse] = {}
    for lift in lifts:
        for item in _warm_up_with(db, lift):
            if item.id in skip:
                continue
            votes = cardio_votes if item.kind == "cardio" else drill_votes
            votes[item.id] = votes.get(item.id, 0) + 1
            items.setdefault(item.id, item)

    cardio = sorted(cardio_votes, key=lambda item_id: -cardio_votes[item_id])[:1]
    drills = sorted(drill_votes, key=lambda item_id: (items[item_id].measure == "seconds", -drill_votes[item_id]))[:_ROUTINE_DRILLS]

    routine: list[WarmUpItemResponse] = []
    for item_id in cardio + drills:
        sets, reps = _routine_dose(items[item_id])
        routine.append(WarmUpItemResponse(exercise=items[item_id], sets=sets, reps=reps))
    seconds = sum(warm_up_seconds(entry.sets, entry.reps) for entry in routine)
    return WarmUpRoutineResponse(estimated_minutes=int(seconds / 60 + 0.5) if routine else 0, items=routine)


def get_exercise(db: Session, user_id: int, exercise_id: int) -> ExerciseDetailResponse:
    exercise = db.get(WorkoutExerciseDBM, exercise_id)
    if exercise is None:
        raise NotFoundError("Exercise not found.")
    return ExerciseDetailResponse(
        **exercise_summary(exercise).model_dump(exclude={"image_url"}),
        image_url=media_url(exercise.images[0]) if exercise.images else None,
        description=exercise.description,
        image_urls=[media_url(path) for path in exercise.images],
        instructions=exercise.instructions,
        tips=exercise.tips,
        common_mistakes=exercise.common_mistakes,
        last_performance=last_performance(db, user_id, exercise_id),
        warm_up_with=_warm_up_with(db, exercise),
        good_warm_up_for=_good_warm_up_for(db, exercise),
    )
