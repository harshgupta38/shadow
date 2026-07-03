"""User-level application behavior settings (separate from identity profile)."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import (
    AIResponseLength,
    AIPersonality,
    DateFormat,
    ThemePreference,
    TimeFormat,
    WeekStartsOn,
)


class UserSetting(Base, TimestampMixin):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    # Appearance
    theme_preference: Mapped[ThemePreference] = mapped_column(
        SAEnum(ThemePreference), default=ThemePreference.light, nullable=False
    )

    # Notifications
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    push_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    daily_brief_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    daily_brief_time: Mapped[str] = mapped_column(String(5), default="08:00", nullable=False)
    weekly_summary_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # AI behavior
    ai_response_length: Mapped[AIResponseLength] = mapped_column(
        SAEnum(AIResponseLength), default=AIResponseLength.balanced, nullable=False
    )
    ai_personality: Mapped[AIPersonality] = mapped_column(
        SAEnum(AIPersonality), default=AIPersonality.coach, nullable=False
    )
    ai_default_model: Mapped[str] = mapped_column(String(40), default="auto", nullable=False)
    ai_suggestions_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    smart_planning_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Planner preferences
    week_starts_on: Mapped[WeekStartsOn] = mapped_column(
        SAEnum(WeekStartsOn), default=WeekStartsOn.monday, nullable=False
    )
    default_reminder_time: Mapped[str] = mapped_column(String(5), default="08:00", nullable=False)
    default_task_duration_minutes: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    time_format: Mapped[TimeFormat] = mapped_column(
        SAEnum(TimeFormat), default=TimeFormat.h12, nullable=False
    )
    date_format: Mapped[DateFormat] = mapped_column(
        SAEnum(DateFormat), default=DateFormat.dd_mm_yyyy, nullable=False
    )

    # Privacy
    analytics_opt_out: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_memory_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Integrations
    integration_google_calendar_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    integration_slack_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Accessibility
    accessibility_reduced_motion: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    accessibility_high_contrast: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    accessibility_font_scale_percent: Mapped[int] = mapped_column(
        Integer, default=100, nullable=False
    )
