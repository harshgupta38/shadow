from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CountdownDBM(Base):
    """A date the person is counting down to, such as a trip or an exam.

    It is not a goal: it has no milestones, only a date. Its tasks are scheduled tasks that point at it
    (ScheduledTaskDBM.countdown_id) and its notes are journal entries tagged to it (CountdownJournalLinkDBM).
    """

    __tablename__ = "countdowns"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'achieved')", name="ck_countdowns_status"),
        CheckConstraint("start_date <= target_date", name="ck_countdowns_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)

    title: Mapped[str] = mapped_column(String(120), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)  # why it matters, shown on the card
    emoji: Mapped[str] = mapped_column(String(16), nullable=False, default="🎯", server_default=text("'🎯'"))
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="brand", server_default=text("'brand'"))

    # The day the person started counting: progress runs from here to the target, so a trip planned a year ago can start a year ago.
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(10), nullable=False, default="active", server_default=text("'active'"))
    achieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class CountdownJournalLinkDBM(Base):
    """Tags a journal day to a countdown: that day's entry is one of the countdown's notes."""

    __tablename__ = "countdown_journal_links"

    countdown_id: Mapped[int] = mapped_column(ForeignKey("countdowns.id", ondelete="CASCADE"), primary_key=True)
    journal_entry_id: Mapped[int] = mapped_column(ForeignKey("journal_entries.id", ondelete="CASCADE"), primary_key=True, index=True)
