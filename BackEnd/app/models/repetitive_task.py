"""Repetitive task models — recurring commitments and optional goal/metric links."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import RepetitiveTaskPriority, RepetitiveTaskStatus

if TYPE_CHECKING:
    from app.models.goal import Goal
    from app.models.metric import TrackedMetric


class RepetitiveTask(Base, TimestampMixin):
    __tablename__ = "repetitive_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    frequencies: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    priority: Mapped[RepetitiveTaskPriority] = mapped_column(
        SAEnum(RepetitiveTaskPriority),
        default=RepetitiveTaskPriority.medium,
        nullable=False,
    )
    status: Mapped[RepetitiveTaskStatus] = mapped_column(
        SAEnum(RepetitiveTaskStatus),
        default=RepetitiveTaskStatus.active,
        nullable=False,
    )

    goal_links: Mapped[list[RepetitiveTaskGoalLink]] = relationship(
        "RepetitiveTaskGoalLink",
        back_populates="task",
        cascade="all, delete-orphan",
    )
    metric_links: Mapped[list[RepetitiveTaskMetricLink]] = relationship(
        "RepetitiveTaskMetricLink",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class RepetitiveTaskGoalLink(Base):
    __tablename__ = "repetitive_task_goals"

    repetitive_task_id: Mapped[int] = mapped_column(
        ForeignKey("repetitive_tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    goal_id: Mapped[int] = mapped_column(
        ForeignKey("goals.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )

    task: Mapped[RepetitiveTask] = relationship("RepetitiveTask", back_populates="goal_links")
    goal: Mapped[Goal] = relationship("Goal")


class RepetitiveTaskMetricLink(Base):
    __tablename__ = "repetitive_task_metrics"

    repetitive_task_id: Mapped[int] = mapped_column(
        ForeignKey("repetitive_tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    metric_id: Mapped[int] = mapped_column(
        ForeignKey("tracked_metrics.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )

    task: Mapped[RepetitiveTask] = relationship("RepetitiveTask", back_populates="metric_links")
    metric: Mapped[TrackedMetric] = relationship("TrackedMetric", back_populates="task_links")
