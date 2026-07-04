"""PlannedTask model — daily/weekly plan items (planned-vs-done)."""

from __future__ import annotations

import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow
from app.models.enums import PlannedTaskPriority, PlannedTaskSource, PlannedTaskStatus


class PlannedTask(Base):
    __tablename__ = "planned_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[datetime.date] = mapped_column(Date, index=True, nullable=False)
    reminder_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[PlannedTaskStatus] = mapped_column(
        SAEnum(PlannedTaskStatus), default=PlannedTaskStatus.planned, nullable=False
    )
    source: Mapped[PlannedTaskSource] = mapped_column(
        SAEnum(PlannedTaskSource),
        default=PlannedTaskSource.manual,
        nullable=False,
    )
    priority: Mapped[PlannedTaskPriority] = mapped_column(
        SAEnum(PlannedTaskPriority),
        default=PlannedTaskPriority.medium,
        nullable=False,
    )
    ai_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_impact_if_skipped: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_confidence_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    suggested_start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    suggested_finish_by_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    execution_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    carried_from_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    generated_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    related_goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("goals.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
