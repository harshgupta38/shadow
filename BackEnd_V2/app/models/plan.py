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
    UniqueConstraint,
    func,
    text,
)  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

from app.models.base import Base


class PlanDBM(Base):
    __tablename__ = "plans"
    __table_args__ = (
        # One plan per source item.
        UniqueConstraint(
            "user_id", "source_type", "source_id",
            name="uq_plan_source",
        ),
        CheckConstraint(
            "source_type IN ('habit', 'task', 'schedule')",
            name="ck_plan_source_type",
        ),
        CheckConstraint(
            "planner_type IN ('simple', 'metric')",
            name="ck_plan_planner_type",
        ),
        CheckConstraint(
            "planner_target IS NULL OR planner_target > 0",
            name="ck_plan_planner_target",
        ),
        CheckConstraint(
            "status IN ('active', 'paused', 'archived')",
            name="ck_plan_status",
        ),
        CheckConstraint(
            "priority IN ('highest', 'high', 'medium', 'low', 'lowest')",
            name="ck_plan_priority",
        ),
        CheckConstraint(
            "preferred_time IN ('flexible', 'morning', 'afternoon', 'evening', 'night', 'custom')",
            name="ck_plan_preferred_time",
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_plan_duration_minutes",
        ),
        CheckConstraint(
            "weekly_count IS NULL OR (weekly_count >= 1 AND weekly_count <= 6)",
            name="ck_plan_weekly_count",
        ),
        CheckConstraint(
            "monthly_count IS NULL OR (monthly_count >= 1 AND monthly_count <= 27)",
            name="ck_plan_monthly_count",
        ),
        CheckConstraint(
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_plan_date_range",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Polymorphic source — not a DB-level FK so future source types can be
    # added without schema changes to this table.
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)

    planner_type: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="simple",
        server_default=text("'simple'"),
    )
    # Normalized: always 1.0 for simple plans; user-specified for metric plans.
    planner_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)

    frequencies: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    weekly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    specific_days: Mapped[list | None] = mapped_column(JSON, nullable=True)
    day_fallback: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("0"),
    )

    preferred_time: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="flexible",
        server_default=text("'flexible'"),
    )
    specific_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    priority: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="medium",
        server_default=text("'medium'"),
    )

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

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
