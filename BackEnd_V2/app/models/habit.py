from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    func,
    text,
)  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column, relationship  # pyright: ignore[reportMissingImports]

from app.models.base import Base


class HabitDBM(Base):
    __tablename__ = "habits"
    __table_args__ = (
        CheckConstraint(
            "preferred_time IN ('flexible', 'morning', 'afternoon', 'evening', 'night', 'custom')",
            name="ck_habits_preferred_time",
        ),
        CheckConstraint(
            "priority IN ('highest', 'high', 'medium', 'low', 'lowest')",
            name="ck_habits_priority",
        ),
        CheckConstraint(
            "status IN ('active', 'paused', 'archived')",
            name="ck_habits_status",
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_habits_duration_minutes",
        ),
        CheckConstraint(
            "weekly_count IS NULL OR (weekly_count >= 1 AND weekly_count <= 6)",
            name="ck_habits_weekly_count",
        ),
        CheckConstraint(
            "monthly_count IS NULL OR (monthly_count >= 1 AND monthly_count <= 27)",
            name="ck_habits_monthly_count",
        ),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_habits_date_range",
        ),
        CheckConstraint(
            "planner_type IN ('simple', 'metric')",
            name="ck_habits_planner_type",
        ),
        CheckConstraint(
            "planner_target IS NULL OR planner_target > 0",
            name="ck_habits_planner_target",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("goals.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    frequencies: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    preferred_time: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="flexible",
        server_default=text("'flexible'"),
    )
    specific_time: Mapped[str | None] = mapped_column(String(10), nullable=True)

    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    weekly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    specific_days: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    day_fallback: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    priority: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="medium",
        server_default=text("'medium'"),
    )

    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="active",
        server_default=text("'active'"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    planner_type: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="simple",
        server_default=text("'simple'"),
    )
    planner_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)

    goal: Mapped["GoalDBM | None"] = relationship(  # type: ignore[name-defined]
        "GoalDBM",
        foreign_keys=[goal_id],
        lazy="select",
    )
