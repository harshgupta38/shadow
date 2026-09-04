"""ActivityLog model — a single logged value for a metric on a date."""

from __future__ import annotations

import datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow
from app.models.enums import ActivitySource


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    metric_id: Mapped[int] = mapped_column(
        ForeignKey("tracked_metrics.id", ondelete="CASCADE"), index=True, nullable=False
    )
    date: Mapped[datetime.date] = mapped_column(Date, index=True, nullable=False)
    value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[ActivitySource] = mapped_column(
        SAEnum(ActivitySource), default=ActivitySource.manual, nullable=False
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
