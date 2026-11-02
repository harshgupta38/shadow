from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


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

    plan: Mapped["WorkoutPlanDBM"] = relationship(back_populates="days")  # type: ignore[name-defined]
    exercises: Mapped[list["WorkoutPlanExerciseDBM"]] = relationship(  # type: ignore[name-defined]
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="WorkoutPlanExerciseDBM.position",
    )
