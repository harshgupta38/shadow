from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ScheduledTaskSubtaskDBM(Base):
    __tablename__ = "scheduled_task_subtasks"
    __table_args__ = (
        CheckConstraint(
            "planner_mode IS NULL OR planner_mode IN ('task', 'highlight')",
            name="ck_scheduled_task_subtasks_planner_mode",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("scheduled_tasks.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    subtask_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(200), nullable=False)
    # null = don't show in planner; 'task' = show as daily action; 'highlight' = show as highlight note
    planner_mode: Mapped[str | None] = mapped_column(String(16), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
