from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

from app.models.base import Base


class DailyPlanRecordDBM(Base):
    """
    Persisted execution record for one recurring-plan occurrence on one date.

    Stores a full snapshot of the plan's display fields so historical records
    remain readable even if the source Habit, Task, or Recurring Plan is later
    deleted.  Only the execution fields (status, actual_value, note) are mutable
    after creation.  Streak counters are computed at read time from recurrence
    rules and are never persisted.
    """

    __tablename__ = "plan_records"
    __table_args__ = (
        # Idempotency: one record per plan per date. NULL plan_id (after plan
        # deletion) is exempt — SQLite considers NULL != NULL in UNIQUE.
        UniqueConstraint("plan_id", "scheduled_date", name="uq_dpr_plan_date"),
        # Fast "all items for user on date" queries.
        Index("ix_dpr_user_date", "user_id", "scheduled_date"),
        # Fast "has plan been materialised for date?" checks.
        Index("ix_dpr_plan_date", "plan_id", "scheduled_date"),
        CheckConstraint(
            "source_type IS NULL OR source_type IN ('habit', 'task')",
            name="ck_dpr_source_type",
        ),
        CheckConstraint(
            "planner_type IN ('simple', 'metric')",
            name="ck_dpr_planner_type",
        ),
        CheckConstraint(
            "status IN ('due', 'done', 'missed')",
            name="ck_dpr_status",
        ),
        CheckConstraint(
            "priority IN ('highest', 'high', 'medium', 'low', 'lowest')",
            name="ck_dpr_priority",
        ),
        CheckConstraint(
            "preferred_time IN ('flexible', 'morning', 'afternoon', 'evening', 'night', 'custom')",
            name="ck_dpr_preferred_time",
        ),
        CheckConstraint("actual_value >= 0", name="ck_dpr_actual_value"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # SET NULL so historical records survive plan deletion.
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("plans.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Polymorphic source reference — snapshot, survives plan deletion.
    source_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False)

    # ── Snapshot of the recurring plan at materialisation time ────────────────
    # These fields are written once and never updated when the source changes.
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    planner_type: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="simple",
        server_default=text("'simple'"),
    )
    planner_target: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    priority: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="medium",
        server_default=text("'medium'"),
    )
    preferred_time: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="flexible",
        server_default=text("'flexible'"),
    )
    specific_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Execution fields (user-modifiable) ────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="due",
        server_default=text("'due'"),
    )
    actual_value: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    # ── Per-occurrence note (does not touch the source Habit/Task note) ───────
    note: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────────────
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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
