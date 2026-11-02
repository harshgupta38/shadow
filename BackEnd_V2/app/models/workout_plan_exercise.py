from sqlalchemy import CheckConstraint, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class WorkoutPlanExerciseDBM(Base):
    __tablename__ = "workout_plan_exercises"
    __table_args__ = (
        CheckConstraint("sets BETWEEN 1 AND 20", name="ck_workout_plan_exercises_sets"),
        CheckConstraint("rest_seconds BETWEEN 0 AND 900", name="ck_workout_plan_exercises_rest"),
        CheckConstraint("weight_kg IS NULL OR weight_kg BETWEEN 0 AND 1000", name="ck_workout_plan_exercises_weight"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    day_id: Mapped[int] = mapped_column(
        ForeignKey("workout_plan_days.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("workout_exercises.id"), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    sets: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[str] = mapped_column(String(20), nullable=False)
    rest_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)

    day: Mapped["WorkoutPlanDayDBM"] = relationship(back_populates="exercises")  # type: ignore[name-defined]
    exercise: Mapped["WorkoutExerciseDBM"] = relationship(lazy="joined")  # type: ignore[name-defined]
