from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

# ─── Literal types ────────────────────────────────────────────────────────────

ThemePreferenceValue = Literal["browser", "dynamic", "light", "dark"]
AIResponseLength = Literal["short", "balanced", "detailed", "very_detailed"]
AIPersonality = Literal["professional", "friendly", "coach", "teacher", "mentor", "minimal"]
WeekStartsOn = Literal["monday", "sunday"]
TimeFormat = Literal["12h", "24h"]
DateFormat = Literal[
    "dd/mm/yyyy",
    "mm/dd/yyyy",
    "dd-mm-yyyy",
    "mm-dd-yyyy",
    "mmm d yyyy",
    "yyyy-mm-dd",
]

# ─── Section schemas ──────────────────────────────────────────────────────────


class AppearanceSection(BaseModel):
    theme_preference: ThemePreferenceValue = "browser"


class NotificationsSection(BaseModel):
    notifications_enabled: bool = True
    push_notifications_enabled: bool = False
    email_notifications_enabled: bool = False
    reminder_notifications_enabled: bool = True
    daily_brief_enabled: bool = False
    daily_brief_time: str = "08:00"
    weekly_summary_enabled: bool = False
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"
    quiet_hours_allow_urgent: bool = True


class AIBehaviorSection(BaseModel):
    ai_response_length: AIResponseLength = "balanced"
    ai_personality: AIPersonality = "friendly"
    ai_provider: str = "gemini"
    ai_default_model: str = "gemini-2.5-flash"


class PlannerSection(BaseModel):
    week_starts_on: WeekStartsOn = "monday"
    default_reminder_time: str = "09:00"
    default_task_duration_minutes: int = Field(default=30, ge=5, le=480)
    time_format: TimeFormat = "12h"
    date_format: DateFormat = "dd/mm/yyyy"


class PrivacySection(BaseModel):
    ai_memory_enabled: bool = True


class AccessibilitySection(BaseModel):
    accessibility_reduced_motion: bool = False
    accessibility_high_contrast: bool = False
    accessibility_font_scale_percent: int = Field(default=100, ge=75, le=150)


# ─── Request / Response ───────────────────────────────────────────────────────


class UpdateSettingsRequest(BaseModel):
    appearance: AppearanceSection
    notifications: NotificationsSection
    ai_behavior: AIBehaviorSection
    planner: PlannerSection
    privacy: PrivacySection
    accessibility: AccessibilitySection


class SettingsDBS(ORMModel):
    appearance: AppearanceSection
    notifications: NotificationsSection
    ai_behavior: AIBehaviorSection
    planner: PlannerSection
    privacy: PrivacySection
    accessibility: AccessibilitySection


class SettingsResponse(SettingsDBS):
    pass


# ─── AI Providers ─────────────────────────────────────────────────────────────


class AIModelDBS(BaseModel):
    name: str
    key: str


class AIProviderDBS(BaseModel):
    name: str
    key: str
    models: list[AIModelDBS]


class AIProviderResponse(AIProviderDBS):
    pass
