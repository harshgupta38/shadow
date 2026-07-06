"""TrackedMetric model — what a user measures (default + custom)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow
from app.models.enums import MetricTimeSpan, MetricType, MetricUnit

if TYPE_CHECKING:
    from app.models.repetitive_task import RepetitiveTaskMetricLink


class TrackedMetric(Base):
    __tablename__ = "tracked_metrics"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_metric_user_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "leetcode_solved"
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    unit: Mapped[MetricUnit] = mapped_column(
        SAEnum(MetricUnit), default=MetricUnit.count, nullable=False
    )
    unit_text: Mapped[str] = mapped_column(String(32), default="count", nullable=False)
    time_span: Mapped[MetricTimeSpan] = mapped_column(
        SAEnum(MetricTimeSpan),
        default=MetricTimeSpan.day,
        nullable=False,
    )
    time_span_custom_text: Mapped[str | None] = mapped_column(String(64), nullable=True)
    type: Mapped[MetricType] = mapped_column(
        SAEnum(MetricType), default=MetricType.custom, nullable=False
    )
    target: Mapped[int | None] = mapped_column(Integer, nullable=True)  # optional daily/weekly target
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    task_links: Mapped[list[RepetitiveTaskMetricLink]] = relationship(
        "RepetitiveTaskMetricLink",
        back_populates="metric",
        cascade="all, delete-orphan",
    )

    @property
    def linked_habit_ids(self) -> list[int]:
        return sorted(link.repetitive_task_id for link in self.task_links)
