from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DietCoachSuggestionDBM(Base):
    """The meal ideas a person last asked the coach for: one row per user, replaced by each new request. It stops counting once
    `expires_at` has passed or the IST day it was made for is over, and every device signed in to the account reads the same row."""

    __tablename__ = "diet_coach_suggestions"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, nullable=False)  # the IST day the ideas were made for
    meal: Mapped[str] = mapped_column(String(20), nullable=False)  # "auto" (the next meal not yet logged), or a meal type
    note: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    shown: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)  # titles offered recently, so "different ideas" differ
    added: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
