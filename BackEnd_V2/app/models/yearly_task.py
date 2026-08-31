from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey,
    Integer, String, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class YearlyTaskDBM(Base):
    """Source of truth for yearly-recurring scheduled tasks.

    Stores the recurrence rule (month + day) instead of a fixed scheduled_date.
    Each year, the planner generates and shows the task on the configured date.
    """
    __tablename__ = "yearly_tasks"
    __table_args__ = (
        CheckConstraint(
            "planner_type IN ('simple', 'metric')",
            name="ck_yearly_tasks_planner_type",
        ),
        CheckConstraint(
            "planner_target IS NULL OR planner_target > 0",
            name="ck_yearly_tasks_planner_target",
        ),
        CheckConstraint(
            "priority IN ('highest', 'high', 'medium', 'low', 'lowest')",
            name="ck_yearly_tasks_priority",
        ),
        CheckConstraint(
            "recurrence_month BETWEEN 1 AND 12",
            name="ck_yearly_tasks_recurrence_month",
        ),
        CheckConstraint(
            "recurrence_day BETWEEN 1 AND 31",
            name="ck_yearly_tasks_recurrence_day",
        ),
        CheckConstraint(
            "preferred_time IN ('flexible', 'morning', 'afternoon', 'evening', 'night', 'custom')",
            name="ck_yearly_tasks_preferred_time",
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_yearly_tasks_duration_minutes",
        ),
        CheckConstraint(
            "snooze_limit IS NULL OR snooze_limit > 0",
            name="ck_yearly_tasks_snooze_limit",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("goals.id", ondelete="SET NULL"), index=True, nullable=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)

    planner_type: Mapped[str] = mapped_column(
        String(8), nullable=False, default="simple", server_default=text("'simple'")
    )
    planner_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)

    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default="medium", server_default=text("'medium'")
    )

    # The day and month of the annual recurrence — year is irrelevant.
    recurrence_month: Mapped[int] = mapped_column(Integer, nullable=False)
    recurrence_day: Mapped[int] = mapped_column(Integer, nullable=False)

    preferred_time: Mapped[str] = mapped_column(
        String(16), nullable=False, default="flexible", server_default=text("'flexible'")
    )
    specific_time: Mapped[str | None] = mapped_column(String(10), nullable=True)

    allow_snoozing: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    snooze_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    goal: Mapped["GoalDBM | None"] = relationship(  # type: ignore[name-defined]
        "GoalDBM",
        foreign_keys=[goal_id],
        lazy="select",
    )
