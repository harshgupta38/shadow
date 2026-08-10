from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, JSON, String, func, text  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

from app.models.base import Base


class Milestone(Base):
    __tablename__ = "milestones"
    __table_args__ = (
        CheckConstraint(
            "status IN ('Not Started', 'In Progress', 'Paused', 'Completed', 'Cancelled')",
            name="ck_milestones_status",
        ),
        CheckConstraint(
            "created_by IN ('User', 'Assistant')",
            name="ck_milestones_created_by",
        ),
        CheckConstraint(
            "estimated_duration_days IS NULL OR estimated_duration_days > 0",
            name="ck_milestones_estimated_duration_days",
        ),
        CheckConstraint(
            '"position" >= 0',
            name="ck_milestones_position",
        ),
        CheckConstraint(
            "total_tasks >= 0",
            name="ck_milestones_total_tasks",
        ),
        CheckConstraint(
            "completed_tasks >= 0",
            name="ck_milestones_completed_tasks",
        ),
        CheckConstraint(
            "completed_tasks <= total_tasks",
            name="ck_milestones_completed_lte_total",
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

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16),
        index=True,
        nullable=False,
        default="Not Started",
        server_default=text("'Not Started'"),
    )

    reason: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    estimated_duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    target_date: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    assistant_context: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    total_tasks: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    completed_tasks: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
