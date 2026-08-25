from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
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
            "planning_method IS NULL OR planning_method IN ('Daily', 'Weekly', 'Monthly')",
            name="ck_tasks_planning_method",
        ),
        CheckConstraint(
            "task_type != 'Binary' OR (current_value IS NULL AND target_value IS NULL AND value_unit IS NULL AND planning_enabled = 0 AND planning_method IS NULL AND planner_target IS NULL)",
            name="ck_tasks_binary_fields",
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

    current_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_unit: Mapped[str | None] = mapped_column(String(64), nullable=True)

    planning_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("0"),
    )
    planning_method: Mapped[str | None] = mapped_column(String(16), nullable=True)
    planner_target: Mapped[float | None] = mapped_column(Float, nullable=True)
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
