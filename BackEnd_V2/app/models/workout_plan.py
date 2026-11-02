from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class WorkoutPlanDBM(Base):
    """A training plan. user_id NULL means a ready-made plan shared by everyone; otherwise it belongs to that user."""

    __tablename__ = "workout_plans"
    __table_args__ = (
        CheckConstraint(
            "goal IN ('build_muscle', 'lose_fat', 'strength', 'endurance', 'general_fitness')",
            name="ck_workout_plans_goal",
        ),
        CheckConstraint("level IN ('beginner', 'intermediate', 'advanced')", name="ck_workout_plans_level"),
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

    days: Mapped[list["WorkoutPlanDayDBM"]] = relationship(  # type: ignore[name-defined]
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="WorkoutPlanDayDBM.weekday",
    )
