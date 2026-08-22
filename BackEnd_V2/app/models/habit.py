from datetime import date, datetime

from sqlalchemy import (
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
            "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
            name="ck_habits_date_range",
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
