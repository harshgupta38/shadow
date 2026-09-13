from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

from app.models.base import Base


class NotificationDBM(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "type IN ('reminder', 'system', 'agent')",
            name="ck_notifications_type",
        ),
        CheckConstraint(
            "level BETWEEN 1 AND 5",
            name="ck_notifications_level",
        ),
        # Prevents duplicate event-keyed notifications per user.
        # NULL event_key rows are exempt (scheduler/manual notifications have no key).
        UniqueConstraint("user_id", "event_key", name="uq_notifications_user_event_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="system",
        server_default=text("'system'"),
    )

    # Priority level 1-5.  Level 1 is always delivered regardless of user prefs;
    # levels 2-5 respect the notifications_enabled master toggle (and levels 4-5
    # also respect reminder_notifications_enabled).
    level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=3,
        server_default=text("3"),
    )

    read: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Stable composite key for event-triggered notifications (e.g. "welcome:42",
    # "streak:99:30:2026-09-07"). NULL for time-based scheduler notifications.
    event_key: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
