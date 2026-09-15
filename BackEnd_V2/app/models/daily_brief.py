from __future__ import annotations

from datetime import date as date_type, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DailyBriefDBM(Base):
    __tablename__ = "daily_briefs"
    __table_args__ = (
        UniqueConstraint("user_id", "brief_date", name="uq_daily_brief_user_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    notification_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    brief_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    complete_brief: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
