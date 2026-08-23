from datetime import date, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PlanItemDBM(Base):
    __tablename__ = "plan_items"
    __table_args__ = (
        # One occurrence per source per day per user — enforces idempotent generation.
        UniqueConstraint(
            "user_id",
            "source_type",
            "source_id",
            "scheduled_date",
            name="uq_plan_items_occurrence",
        ),
        CheckConstraint(
            "status IN ('planned', 'done', 'missed')",
            name="ck_plan_items_status",
        ),
        CheckConstraint(
            "priority IN ('highest', 'high', 'medium', 'low', 'lowest')",
            name="ck_plan_items_priority",
        ),
        CheckConstraint(
            "habit_type IN ('simple', 'metric')",
            name="ck_plan_items_habit_type",
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_plan_items_duration_minutes",
        ),
        CheckConstraint(
            "target_value IS NULL OR target_value > 0",
            name="ck_plan_items_target_value",
        ),
        CheckConstraint(
            "time_span IN ('Day', 'Week', 'Month', 'Year')",
            name="ck_plan_items_time_span",
        ),
        # Fast lookup: all items for a user on a given date.
        Index("ix_plan_items_user_date", "user_id", "scheduled_date"),
        # Fast cleanup: all items for a given source.
        Index("ix_plan_items_source", "source_type", "source_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Generic source pointer — extend service layer when adding new source types.
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Snapshot of source fields captured at generation time.
    # Today Plan reads these directly — it does NOT fetch the originating Habit.
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)
    # HH:MM; NULL when the source has no specific time preference.
    scheduled_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default="medium", server_default=text("'medium'")
    )
    # planned → done | missed  (reversible to planned; done/missed are terminal by convention)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="planned", server_default=text("'planned'")
    )

    # Metric-habit snapshot — NULL for simple habits and non-habit sources.
    habit_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    target_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_unit: Mapped[str] = mapped_column(
        String(64), nullable=False, default="count", server_default=text("'count'")
    )
    time_span: Mapped[str] = mapped_column(
        String(16), nullable=False, default="Day", server_default=text("'Day'")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
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
