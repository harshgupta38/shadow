"""Schemas for Settings domain (application behavior configuration)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import (
    AIResponseLength,
    AIPersonality,
    DateFormat,
    ThemePreference,
    TimeFormat,
    WeekStartsOn,
)


class AppearanceSettings(BaseModel):
    theme_preference: ThemePreference


class AppearanceSettingsUpdate(BaseModel):
    theme_preference: ThemePreference


class DynamicAppearanceResolveRead(BaseModel):
    effective_theme: Literal["light", "dark"]
    timezone: str
    sunrise: datetime
    sunset: datetime
    next_transition_at: datetime
    source: Literal["open_meteo"] = "open_meteo"


class NotificationSettings(BaseModel):
    notifications_enabled: bool
    push_notifications_enabled: bool
    email_notifications_enabled: bool
    reminder_notifications_enabled: bool
    daily_brief_enabled: bool
    daily_brief_time: str
    weekly_summary_enabled: bool


class NotificationSettingsUpdate(BaseModel):
    notifications_enabled: bool | None = None
    push_notifications_enabled: bool | None = None
    email_notifications_enabled: bool | None = None
    reminder_notifications_enabled: bool | None = None
    daily_brief_enabled: bool | None = None
    daily_brief_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    weekly_summary_enabled: bool | None = None


class AIBehaviorSettings(BaseModel):
    ai_response_length: AIResponseLength
    ai_personality: AIPersonality
    ai_default_model: str
    ai_suggestions_enabled: bool
    smart_planning_enabled: bool


class AIBehaviorSettingsUpdate(BaseModel):
    ai_response_length: AIResponseLength | None = None
    ai_personality: AIPersonality | None = None
    ai_default_model: str | None = Field(default=None, min_length=1, max_length=40)
    ai_suggestions_enabled: bool | None = None
    smart_planning_enabled: bool | None = None


class PlannerSettings(BaseModel):
    week_starts_on: WeekStartsOn
    default_reminder_time: str
    default_task_duration_minutes: int
    time_format: TimeFormat
    date_format: DateFormat


class PlannerSettingsUpdate(BaseModel):
    week_starts_on: WeekStartsOn | None = None
    default_reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    default_task_duration_minutes: int | None = Field(default=None, ge=5, le=360)
    time_format: TimeFormat | None = None
    date_format: DateFormat | None = None


class PrivacySettings(BaseModel):
    analytics_opt_out: bool
    ai_memory_enabled: bool


class PrivacySettingsUpdate(BaseModel):
    analytics_opt_out: bool | None = None
    ai_memory_enabled: bool | None = None


class IntegrationSettings(BaseModel):
    google_calendar_enabled: bool
    slack_enabled: bool


class IntegrationSettingsUpdate(BaseModel):
    google_calendar_enabled: bool | None = None
    slack_enabled: bool | None = None


class AccessibilitySettings(BaseModel):
    reduced_motion: bool
    high_contrast: bool
    font_scale_percent: int


class AccessibilitySettingsUpdate(BaseModel):
    reduced_motion: bool | None = None
    high_contrast: bool | None = None
    font_scale_percent: int | None = Field(default=None, ge=80, le=140)


class SettingsRead(BaseModel):
    appearance: AppearanceSettings
    notifications: NotificationSettings
    ai_behavior: AIBehaviorSettings
    planner: PlannerSettings
    privacy: PrivacySettings
    integrations: IntegrationSettings
    accessibility: AccessibilitySettings
