"""Per-user granular email notification preferences."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class EmailNotificationPreference(Base, TimestampMixin):
    __tablename__ = "email_notification_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    verification_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    password_changed_alert: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    new_device_alert: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    task_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    today_plan_generated: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    daily_motivational_quote: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    daily_motivational_quote_time: Mapped[str] = mapped_column(
        String(5),
        default="07:00",
        nullable=False,
    )
    daily_brief: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    weekly_summary: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    streak_risk_alert: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    milestone_due_soon: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    goal_target_risk: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    daily_report_ready: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    weekly_report_ready: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    progress_coach_recommendations: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    export_ready: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
