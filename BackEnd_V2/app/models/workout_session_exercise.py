from sqlalchemy import ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class WorkoutSessionExerciseDBM(Base):
    __tablename__ = "workout_session_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("workout_exercises.id"), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    target_sets: Mapped[int] = mapped_column(Integer, nullable=False)
    target_reps: Mapped[str] = mapped_column(String(20), nullable=False)
    rest_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sets: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)  # one {reps, weight_kg, done} per set, in order

    session: Mapped["WorkoutSessionDBM"] = relationship(back_populates="exercises")  # type: ignore[name-defined]
    exercise: Mapped["WorkoutExerciseDBM"] = relationship(lazy="joined")  # type: ignore[name-defined]
