"""Builds a workout plan from the Workout Coach's draft: it chooses the exercises.

The chat agent does not search the library or pick exercises. For each place in a session it names a muscle (and maybe a few words of
the exercise's name, such as "push-up"), and this module picks a real exercise from the library that fits the person's level and
equipment, then fits the sets, reps and rest to how that exercise is counted. Choosing here instead of in the model is what keeps a
plan cheap: every search the model makes is sent back to it on each later step, and counts against the user's daily AI allowance.
"""

import re
from dataclasses import dataclass
from typing import get_args

from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.workout_exercise import WorkoutExerciseDBM
from app.schemas.weekly_insights import WEEKDAYS_LONG
from app.schemas.workout import (
    Level,
    PlanDayInput,
    PlanDraftInput,
    PlanExerciseInput,
    PlanSlotInput,
    WorkoutPlanSaveRequest,
)
from app.services import workout_plans_service
from app.services.workout_calc_service import clamp_int
from app.services.workout_library_service import all_exercises, curated_exercise_ids, exercise_rank

_LEVELS = get_args(Level)
_SEPARATORS = re.compile(r"[-\s]+")
_BARE_NUMBER = re.compile(r"\d+")
_TIMED_MINUTES = re.compile(r"\d+\s*min", re.IGNORECASE)
_TIMED_SECONDS = re.compile(r"\d+\s*sec", re.IGNORECASE)
_ANY_TIME = re.compile(r"\d\s*(min|sec)\b", re.IGNORECASE)

_NAME_MAX = 80
_DESCRIPTION_MAX = 500
_RATIONALE_MAX = 1500
_DAY_NAME_MAX = 60
_NOTES_SHOWN = 5


@dataclass
class BuiltPlan:
    plan: WorkoutPlanSaveRequest  # checked: every exercise exists and every dose fits how it is counted
    rationale: str
    exercises: dict[int, WorkoutExerciseDBM]  # the exercises used, by id
    notes: list[str]  # slots that had to be left out, for the person's reply


def _plain(text: str) -> str:
    """Lower case with hyphens read as spaces, so 'push up' finds 'Push-Up'."""
    return _SEPARATORS.sub(" ", text.lower()).strip()


def usable(row: WorkoutExerciseDBM, owned: set[str]) -> bool:
    """Whether someone with this equipment can do the exercise. A bodyweight move that still needs something (a pull-up bar, a box) is
    only usable with "other", so a person with dumbbells and a mat never gets a pull-up."""
    if "full_gym" in owned:
        return True
    if row.equipment == "bodyweight":
        return row.equipment_type == "no_equipment" or "other" in owned
    return row.equipment in owned


def _pick(
    rows: list[WorkoutExerciseDBM],
    slot: PlanSlotInput,
    owned: set[str],
    level_cap: int,
    used: set[int],
    today: set[int],
    rank,
) -> WorkoutExerciseDBM | None:
    """The best exercise for one slot: the muscle it must train and, if given, words from its name. It must use only equipment the
    person has, and that is never relaxed (a bodyweight-only person does not get a barbell move), so a slot nothing fits returns None.
    An exercise is never used twice in the same day (`today`). Everything else is a preference, relaxed in turn when nothing fits: not
    repeating an exercise from another day, the level, then the name hint."""
    hint = _plain(slot.hint or "")
    kind = "cardio" if slot.muscle is None else "strength"
    candidates = [
        row for row in rows
        if row.kind == kind and (slot.muscle is None or slot.muscle in row.primary_muscles) and usable(row, owned) and row.id not in today
    ]
    # (respect the level, use the name hint)
    attempts = [(True, True), (False, True), (True, False), (False, False)]
    for avoid_repeats in (True, False):
        for respect_level, use_hint in attempts:
            if use_hint and not hint:
                continue
            pool = [
                row for row in candidates
                if (not respect_level or _LEVELS.index(row.level) <= level_cap)
                and (not avoid_repeats or row.id not in used)
                and (not use_hint or hint in _plain(row.name))
            ]
            if pool:
                return min(pool, key=rank)
    return None


def _fitting_reps(row: WorkoutExerciseDBM, reps: str | None) -> str:
    """Models often get the dose of a timed exercise slightly wrong. A bare number takes the unit the exercise is counted in, and a dose
    of the wrong kind falls back to the exercise's own, rather than failing the whole plan."""
    text = (reps or "").strip()
    if row.measure == "minutes":
        if _BARE_NUMBER.fullmatch(text):
            return f"{text} min"
        return text if _TIMED_MINUTES.fullmatch(text) else row.default_reps
    if row.measure == "seconds":
        if _BARE_NUMBER.fullmatch(text):
            return f"{text} sec"
        return text if _TIMED_SECONDS.fullmatch(text) else row.default_reps
    return row.default_reps if not text or _ANY_TIME.search(text) else text


def _entry(row: WorkoutExerciseDBM, slot: PlanSlotInput) -> PlanExerciseInput:
    timed_block = row.measure == "minutes"  # one block of time, with no rest between sets
    return PlanExerciseInput(
        exercise_id=row.id,
        sets=1 if timed_block else clamp_int(slot.sets, 1, 20, row.default_sets),
        reps=_fitting_reps(row, slot.reps),
        rest_seconds=0 if timed_block else clamp_int(slot.rest_seconds, 0, 900, row.default_rest_seconds),
    )


def build_plan(db: Session, draft: PlanDraftInput) -> BuiltPlan:
    """The plan the draft describes, with real exercises chosen for every slot. Raises AppError when the draft names an exercise that
    does not exist or leaves a session with nothing in it, with a message the model can act on."""
    owned = set(draft.equipment)  # empty means bodyweight only
    level_cap = _LEVELS.index(draft.level)
    rows = all_exercises(db)
    by_id = {row.id: row for row in rows}
    rank = exercise_rank(curated_exercise_ids(db))

    pinned = {slot.exercise_id for day in draft.days for slot in day.exercises if slot.exercise_id is not None}
    if unknown := sorted(pinned - by_id.keys()):
        raise AppError(
            f"These exercise_id values are not in the library: {', '.join(str(i) for i in unknown)}. "
            "Leave exercise_id null and describe the exercise by its muscle instead."
        )

    used = set(pinned)  # across the plan: a preference
    notes: list[str] = []
    chosen: dict[int, WorkoutExerciseDBM] = {}
    days: list[PlanDayInput] = []
    for day in draft.days:
        weekday_name = WEEKDAYS_LONG[day.weekday]
        today = {slot.exercise_id for slot in day.exercises if slot.exercise_id is not None}  # within the day: a rule
        entries: list[PlanExerciseInput] = []
        day_notes: list[str] = []
        for slot in day.exercises:
            row = by_id[slot.exercise_id] if slot.exercise_id is not None else _pick(rows, slot, owned, level_cap, used, today, rank)
            if row is None:
                day_notes.append(f"{weekday_name}: no {(slot.muscle or slot.hint or 'matching').replace('_', ' ')} exercise fits your equipment, so it was left out.")
                continue
            used.add(row.id)
            today.add(row.id)
            chosen[row.id] = row
            entries.append(_entry(row, slot))
        if not entries:
            # A day nothing fits is left out with one honest note, not an error: the person gets the rest of the plan at once instead of
            # the model retrying at the cost of their AI allowance.
            wanted = ", ".join(dict.fromkeys((slot.muscle or slot.hint or "cardio").replace("_", " ") for slot in day.exercises))
            add = " Tell me if you have a pull-up bar, bands or dumbbells and I'll add it." if "full_gym" not in owned else ""
            notes.append(f"{weekday_name} was left out: nothing fits your equipment for {wanted}.{add}")
            continue
        notes.extend(day_notes)
        days.append(PlanDayInput(weekday=day.weekday, name=day.name.strip()[:_DAY_NAME_MAX] or f"{weekday_name} workout", exercises=entries))

    if not days:
        can_train = sorted({m for row in rows if row.kind == "strength" and usable(row, owned) for m in row.primary_muscles})
        raise AppError(
            "Nothing in the library fits those slots with the equipment given. With that equipment the library can train: "
            f"{', '.join(m.replace('_', ' ') for m in can_train) or 'nothing'}. Plan around those muscles, or add equipment the user has "
            "(for example 'other' for a pull-up bar, 'band' or 'dumbbell')."
        )

    request = WorkoutPlanSaveRequest(
        name=draft.name.strip()[:_NAME_MAX],
        description=draft.description.strip()[:_DESCRIPTION_MAX],
        goal=draft.goal,
        level=draft.level,
        days=days,
    )
    # The same check a saved plan goes through, so a draft can never offer something the person could not save.
    request = request.model_copy(update={"days": workout_plans_service.normalised_days(db, request.days)})
    return BuiltPlan(plan=request, rationale=draft.rationale.strip()[:_RATIONALE_MAX], exercises=chosen, notes=notes[:_NOTES_SHOWN])
