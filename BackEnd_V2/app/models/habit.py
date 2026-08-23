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
    Text,
    func,
    text,
)  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

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
            "habit_type IN ('simple', 'metric')",
            name="ck_habits_habit_type",
        ),
        CheckConstraint(
            "target_value IS NULL OR target_value > 0",
            name="ck_habits_target_value",
        ),
        CheckConstraint(
            "time_span IS NULL OR time_span IN ('Day', 'Week', 'Month', 'Year')",
            name="ck_habits_time_span",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    motivation: Mapped[str | None] = mapped_column(Text, nullable=True)
    frequencies: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # "flexible" | "morning" | "afternoon" | "evening" | "night" | "custom"
    preferred_time: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="flexible",
        server_default=text("'flexible'"),
    )
    # HH:MM — only populated when preferred_time == "custom"
    specific_time: Mapped[str | None] = mapped_column(String(10), nullable=True)

    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # NULL end_date means ongoing; non-NULL means the habit ends on that date.
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # How many times per week (only meaningful when "weekly" is in frequencies)
    weekly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # How many times per month (only meaningful when "monthly" is in frequencies)
    monthly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Specific days of month (1-31) for the specific_day picker; stored as JSON array
    specific_days: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    # When specific_days contains 29/30/31 and that day doesn't exist: True=use last day, False=skip
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

    # Linked items field for storing related items in JSON format
    linked_items: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )

    # "simple" | "metric" — metric habits track a measurable target (e.g. 10 pages/day)
    habit_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="simple",
        server_default=text("'simple'"),
    )
    # Positive integer target; only meaningful when habit_type == "metric"
    target_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Unit label for the target (e.g. "pages", "km"); defaults to "count"
    target_unit: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="count",
        server_default=text("'count'"),
    )
    # "Day" | "Week" | "Month" | "Year"; defaults to "Day"
    time_span: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="Day",
        server_default=text("'Day'"),
    )
