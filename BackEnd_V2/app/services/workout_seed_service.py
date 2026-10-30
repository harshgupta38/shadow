"""Keeps the ready-made exercise library and plans in the database in step with app/data/workout/*.json.

Runs at startup. Each row stores a fingerprint of the spec it was built from, so a normal restart writes
nothing and editing a JSON file updates only the rows that changed.
"""

import hashlib
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common.workout import dose_fits
from app.models.workout import WorkoutExerciseDBM, WorkoutPlanDayDBM, WorkoutPlanDBM, WorkoutPlanExerciseDBM

_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "workout"

_EXERCISE_FIELDS = (
    "name",
    "kind",
    "measure",
    "equipment",
    "level",
    "mechanic",
    "primary_muscles",
    "secondary_muscles",
    "images",
    "description",
    "instructions",
    "tips",
    "common_mistakes",
    "default_sets",
    "default_reps",
    "default_rest_seconds",
)
_PLAN_FIELDS = ("name", "description", "goal", "level")


def _load(filename: str) -> list[dict]:
    return json.loads((_DATA_DIR / filename).read_text(encoding="utf-8"))


def _fingerprint(spec: dict) -> str:
    return hashlib.sha256(json.dumps(spec, sort_keys=True).encode("utf-8")).hexdigest()


def _exercise_fingerprint(spec: dict) -> str:
    """Covers the fields the sync writes, so adding one to _EXERCISE_FIELDS refreshes every row on the next start."""
    return _fingerprint({field: spec[field] for field in _EXERCISE_FIELDS})


def _build_days(spec: dict, exercise_ids: dict[str, int]) -> list[WorkoutPlanDayDBM]:
    days = []
    for day in spec["days"]:
        exercises = []
        for position, item in enumerate(day["exercises"]):
            if item["exercise"] not in exercise_ids:
                raise ValueError(f"Ready-made plan '{spec['slug']}' uses unknown exercise '{item['exercise']}'.")
            exercises.append(
                WorkoutPlanExerciseDBM(
                    position=position,
                    exercise_id=exercise_ids[item["exercise"]],
                    sets=item["sets"],
                    reps=item["reps"],
                    rest_seconds=item["rest_seconds"],
                    weight_kg=item["weight_kg"],
                    note=item["note"],
                )
            )
        days.append(WorkoutPlanDayDBM(weekday=day["weekday"], name=day["name"], exercises=exercises))
    return days


def normalise_plan_doses(db: Session) -> None:
    """Plan rows saved before exercises had a measure can hold a dose that no longer fits, such as a plank as
    3 x 8-12. Such rows take the exercise's own default dose. Rows that already fit are left alone."""
    changed = False
    for row in db.scalars(select(WorkoutPlanExerciseDBM)).all():
        exercise = row.exercise
        if exercise.measure == "minutes" and (row.sets, row.rest_seconds, row.weight_kg) != (1, 0, None):
            row.sets, row.rest_seconds, row.weight_kg = 1, 0, None
            changed = True
        if exercise.measure == "seconds" and row.weight_kg is not None:
            row.weight_kg = None
            changed = True
        if not dose_fits(exercise.measure, row.reps):
            row.reps = exercise.default_reps
            changed = True
    if changed:
        db.commit()


def sync_seed(db: Session) -> None:
    """Make the ready-made library match the bundled JSON. Raises if the JSON refers to something missing."""
    exercise_ids: dict[str, int] = {}
    for position, spec in enumerate(_load("exercise_library.json")):
        row = db.scalar(select(WorkoutExerciseDBM).where(WorkoutExerciseDBM.slug == spec["slug"]))
        if row is None:
            row = WorkoutExerciseDBM(slug=spec["slug"])
            db.add(row)
        fingerprint = _exercise_fingerprint(spec)
        if row.seed_hash != fingerprint:
            for field in _EXERCISE_FIELDS:
                setattr(row, field, spec[field])
            row.seed_hash = fingerprint
        row.position = position
        db.flush()
        exercise_ids[spec["slug"]] = row.id

    for position, spec in enumerate(_load("predefined_plans.json")):
        plan = db.scalar(select(WorkoutPlanDBM).where(WorkoutPlanDBM.slug == spec["slug"]))
        if plan is None:
            plan = WorkoutPlanDBM(slug=spec["slug"], user_id=None)
            db.add(plan)
        plan.sort_order = position
        fingerprint = _fingerprint(spec)
        if plan.seed_hash != fingerprint:
            for field in _PLAN_FIELDS:
                setattr(plan, field, spec[field])
            plan.seed_hash = fingerprint
            plan.days.clear()
            db.flush()  # the old days must go before the new ones reuse their weekdays
            plan.days.extend(_build_days(spec, exercise_ids))
        db.flush()

    db.commit()
