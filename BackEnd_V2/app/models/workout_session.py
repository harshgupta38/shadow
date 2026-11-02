from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

OPEN_SESSION_INDEX = "uq_workout_sessions_one_open"  # one open workout per user; db/migrations.py creates it on existing databases
OPEN_SESSION_WHERE = "status = 'in_progress'"


class WorkoutSessionDBM(Base):
    """One workout, planned or freestyle.

    The totals (exercise_count, sets_done, volume_kg, muscles, muscle_sets) are recomputed from the sets on
    every save, so history and summary queries never have to walk the individual sets.
    """

    __tablename__ = "workout_sessions"
    __table_args__ = (
        CheckConstraint("status IN ('in_progress', 'completed')", name="ck_workout_sessions_status"),
        CheckConstraint("plan_weekday IS NULL OR plan_weekday BETWEEN 0 AND 6", name="ck_workout_sessions_plan_weekday"),
        Index("ix_workout_sessions_user_date", "user_id", "session_date"),
        Index("ix_workout_sessions_user_status", "user_id", "status"),
        Index(OPEN_SESSION_INDEX, "user_id", unique=True, sqlite_where=text(OPEN_SESSION_WHERE)),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("workout_plans.id", ondelete="SET NULL"), nullable=True)
    plan_day_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_plan_days.id", ondelete="SET NULL"),
        nullable=True,
    )
    # 0 = Sunday … 6 = Saturday. Kept when the plan's days are rebuilt, so a workout still matches the day it started from.
    plan_weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)
    plan_name: Mapped[str | None] = mapped_column(String(80), nullable=True)  # snapshot, kept if the plan changes
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)  # IST calendar day the workout started
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    exercise_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sets_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    volume_kg: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    muscles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    muscle_sets: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    exercises: Mapped[list["WorkoutSessionExerciseDBM"]] = relationship(  # type: ignore[name-defined]
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="WorkoutSessionExerciseDBM.position",
    )
