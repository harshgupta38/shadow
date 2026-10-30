from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column, relationship  # pyright: ignore[reportMissingImports]

from app.models.base import Base

EQUIPMENT_VALUES = ("bodyweight", "dumbbell", "barbell", "machine", "cable", "kettlebell", "band", "other")
LEVEL_VALUES = ("beginner", "intermediate", "advanced")
MECHANIC_VALUES = ("compound", "isolation")
GOAL_VALUES = ("build_muscle", "lose_fat", "strength", "endurance", "general_fitness")
SESSION_STATUS_VALUES = ("in_progress", "completed")


def _one_of(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


class WorkoutExerciseDBM(Base):
    """A movement in the exercise library. Rows are seeded from app/data/workout/exercise_library.json."""

    __tablename__ = "workout_exercises"
    __table_args__ = (
        CheckConstraint(_one_of("equipment", EQUIPMENT_VALUES), name="ck_workout_exercises_equipment"),
        CheckConstraint(_one_of("level", LEVEL_VALUES), name="ck_workout_exercises_level"),
        CheckConstraint(_one_of("mechanic", MECHANIC_VALUES), name="ck_workout_exercises_mechanic"),
        CheckConstraint("default_sets BETWEEN 1 AND 20", name="ck_workout_exercises_default_sets"),
        CheckConstraint("default_rest_seconds BETWEEN 0 AND 900", name="ck_workout_exercises_default_rest"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    equipment: Mapped[str] = mapped_column(String(16), nullable=False)
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


class WorkoutPlanDBM(Base):
    """A training plan. user_id NULL means a ready-made plan shared by everyone; otherwise it belongs to that user."""

    __tablename__ = "workout_plans"
    __table_args__ = (
        CheckConstraint(_one_of("goal", GOAL_VALUES), name="ck_workout_plans_goal"),
        CheckConstraint(_one_of("level", LEVEL_VALUES), name="ck_workout_plans_level"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )
    slug: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)  # key for ready-made plans
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    goal: Mapped[str] = mapped_column(String(24), nullable=False)
    level: Mapped[str] = mapped_column(String(16), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seed_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
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

    days: Mapped[list["WorkoutPlanDayDBM"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="WorkoutPlanDayDBM.weekday",
    )


class WorkoutPlanDayDBM(Base):
    __tablename__ = "workout_plan_days"
    __table_args__ = (
        UniqueConstraint("plan_id", "weekday", name="uq_workout_plan_days_weekday"),
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_workout_plan_days_weekday"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)  # 0 = Sunday … 6 = Saturday
    name: Mapped[str] = mapped_column(String(60), nullable=False)

    plan: Mapped[WorkoutPlanDBM] = relationship(back_populates="days")
    exercises: Mapped[list["WorkoutPlanExerciseDBM"]] = relationship(
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="WorkoutPlanExerciseDBM.position",
    )


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

    day: Mapped[WorkoutPlanDayDBM] = relationship(back_populates="exercises")
    exercise: Mapped[WorkoutExerciseDBM] = relationship(lazy="joined")


class WorkoutSettingDBM(Base):
    """Per-user workout preferences. One row per user, created the first time it is needed."""

    __tablename__ = "workout_settings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    active_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class WorkoutSessionDBM(Base):
    """One workout, planned or freestyle.

    The totals (exercise_count, sets_done, volume_kg, muscles, muscle_sets) are recomputed from the sets on
    every save, so history and summary queries never have to walk the individual sets.
    """

    __tablename__ = "workout_sessions"
    __table_args__ = (
        CheckConstraint(_one_of("status", SESSION_STATUS_VALUES), name="ck_workout_sessions_status"),
        Index("ix_workout_sessions_user_date", "user_id", "session_date"),
        Index("ix_workout_sessions_user_status", "user_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("workout_plans.id", ondelete="SET NULL"), nullable=True)
    plan_day_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_plan_days.id", ondelete="SET NULL"),
        nullable=True,
    )
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

    exercises: Mapped[list["WorkoutSessionExerciseDBM"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="WorkoutSessionExerciseDBM.position",
    )


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

    session: Mapped[WorkoutSessionDBM] = relationship(back_populates="exercises")
    exercise: Mapped[WorkoutExerciseDBM] = relationship(lazy="joined")
    sets: Mapped[list["WorkoutSessionSetDBM"]] = relationship(
        back_populates="session_exercise",
        cascade="all, delete-orphan",
        order_by="WorkoutSessionSetDBM.position",
    )


class WorkoutSessionSetDBM(Base):
    __tablename__ = "workout_session_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_exercise_id: Mapped[int] = mapped_column(
        ForeignKey("workout_session_exercises.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    session_exercise: Mapped[WorkoutSessionExerciseDBM] = relationship(back_populates="sets")
