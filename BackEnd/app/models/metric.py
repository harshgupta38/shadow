"""TrackedMetric model — what a user measures (default + custom)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow
from app.models.enums import MetricType, MetricUnit


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
    type: Mapped[MetricType] = mapped_column(
        SAEnum(MetricType), default=MetricType.custom, nullable=False
    )
    target: Mapped[int | None] = mapped_column(Integer, nullable=True)  # optional daily/weekly target
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
