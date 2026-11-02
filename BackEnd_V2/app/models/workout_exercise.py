from sqlalchemy import CheckConstraint, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkoutExerciseDBM(Base):
    """A movement in the exercise library. Rows are seeded from app/data/workout/exercise_library.json."""

    __tablename__ = "workout_exercises"
    __table_args__ = (
        CheckConstraint(
            "equipment IN ('bodyweight', 'dumbbell', 'barbell', 'machine', 'cable', 'kettlebell', 'band', 'other')",
            name="ck_workout_exercises_equipment",
        ),
        # what it takes to do the exercise: nothing, a few portable items, or gym gear
        CheckConstraint(
            "equipment_type IN ('no_equipment', 'light_equipment', 'heavy_equipment')",
            name="ck_workout_exercises_equipment_type",
        ),
        CheckConstraint("level IN ('beginner', 'intermediate', 'advanced')", name="ck_workout_exercises_level"),
        CheckConstraint("mechanic IN ('compound', 'isolation')", name="ck_workout_exercises_mechanic"),
        CheckConstraint("kind IN ('strength', 'cardio', 'warmup')", name="ck_workout_exercises_kind"),
        # how an exercise is counted: one block of time, sets of time, or sets of reps
        CheckConstraint("measure IN ('minutes', 'seconds', 'reps')", name="ck_workout_exercises_measure"),
        CheckConstraint("default_sets BETWEEN 1 AND 20", name="ck_workout_exercises_default_sets"),
        CheckConstraint("default_rest_seconds BETWEEN 0 AND 900", name="ck_workout_exercises_default_rest"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="strength")
    measure: Mapped[str] = mapped_column(String(12), nullable=False, default="reps")
    equipment: Mapped[str] = mapped_column(String(16), nullable=False)
    equipment_type: Mapped[str] = mapped_column(String(16), nullable=False, default="heavy_equipment")
    level: Mapped[str] = mapped_column(String(16), nullable=False)
    mechanic: Mapped[str] = mapped_column(String(16), nullable=False)
    primary_muscles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    secondary_muscles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    images: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    instructions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    tips: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    common_mistakes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    default_sets: Mapped[int] = mapped_column(Integer, nullable=False)
    default_reps: Mapped[str] = mapped_column(String(20), nullable=False)
    default_rest_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seed_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
