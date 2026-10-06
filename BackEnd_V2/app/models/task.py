from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    func,
    text,
)  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

from app.models.base import Base


class TaskDBM(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "task_type IN ('Numeric', 'Binary')",
            name="ck_tasks_task_type",
        ),
        CheckConstraint(
            "((task_type = 'Numeric' AND status IN ('Not Started', 'In Progress', 'Paused', 'Completed', 'Cancelled')) OR (task_type = 'Binary' AND status IN ('Not Started', 'Completed', 'Cancelled')))",
            name="ck_tasks_status",
        ),
        CheckConstraint(
            "created_by IN ('User', 'Assistant')",
            name="ck_tasks_created_by",
        ),
        CheckConstraint(
            '"position" >= 0',
            name="ck_tasks_position",
        ),
        CheckConstraint(
            "current_value IS NULL OR current_value >= 0",
            name="ck_tasks_current_value",
        ),
        CheckConstraint(
            "target_value IS NULL OR target_value > 0",
            name="ck_tasks_target_value",
        ),
        CheckConstraint(
            "current_value IS NULL OR target_value IS NULL OR current_value <= target_value",
            name="ck_tasks_current_lte_target",
        ),
        CheckConstraint(
            "planner_target IS NULL OR planner_target > 0",
            name="ck_tasks_planner_target",
        ),
        CheckConstraint(
            "planner_type IN ('simple', 'metric')",
            name="ck_tasks_planner_type",
        ),
        # Binary tasks are mark-done only — no numeric tracking, no planning.
        CheckConstraint(
            "task_type != 'Binary' OR (current_value IS NULL AND target_value IS NULL AND value_unit IS NULL AND planner_target IS NULL AND planning_enabled = 0)",
            name="ck_tasks_simple_fields",
        ),
        CheckConstraint(
            "priority IN ('highest', 'high', 'medium', 'low', 'lowest')",
            name="ck_tasks_priority",
        ),
        CheckConstraint(
            "preferred_time IN ('flexible', 'morning', 'afternoon', 'evening', 'night', 'custom')",
            name="ck_tasks_preferred_time",
        ),
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_tasks_duration_minutes",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    goal_id: Mapped[int] = mapped_column(
        ForeignKey("goals.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    milestone_id: Mapped[int] = mapped_column(
        ForeignKey("milestones.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    task_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="Not Started",
        server_default=text("'Not Started'"),
    )

    # Numeric-task progress tracking — NULL for Binary tasks.
    current_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    value_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Planning configuration
    planning_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("0"),
    )
    tracking_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("0"),
    )
    # planner_type: "simple" = mark done once per session; "metric" = track amount per session.
    planner_type: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="simple",
        server_default=text("'simple'"),
    )
    # planner_target: amount to complete per planned occurrence (Numeric+metric only).
    planner_target: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Scheduling fields — mirror the Habit model so the planning engine
    # can operate on tasks and habits with the same logic.
    frequencies: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
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
    # HH:MM; only when preferred_time == "custom".
    specific_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # weekly / monthly sub-counts — same semantics as HabitDBM.
    weekly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    monthly_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    specific_days: Mapped[list | None] = mapped_column(JSON, nullable=True)
    day_fallback: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("0"),
    )

    assistant_context: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    note: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    created_by: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="User",
        server_default=text("'User'"),
    )

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
