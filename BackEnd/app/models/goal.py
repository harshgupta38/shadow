"""Goal model (with its milestones)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import GoalStatus


class Goal(Base, TimestampMixin):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[GoalStatus] = mapped_column(
        SAEnum(GoalStatus), default=GoalStatus.active, nullable=False
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0–100
    target_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    milestones: Mapped[list["Milestone"]] = relationship(
        "Milestone",
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="Milestone.order",
    )
