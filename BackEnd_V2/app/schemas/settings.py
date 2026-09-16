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
    "dd mmmm yyyy",
    "dd/mm/yy",
    "dd/mm/yyyy",
    "dd-mm-yy",
    "dd-mm-yyyy",
    "mmm d, yyyy",
]

# ─── Section schemas ──────────────────────────────────────────────────────────


class AppearanceSection(BaseModel):
    theme_preference: ThemePreferenceValue = "browser"


class NotificationsSection(BaseModel):
    notifications_enabled: bool = True
    email_notifications_enabled: bool = False
    reminder_notifications_enabled: bool = True
    daily_brief_enabled: bool = False
    weekly_summary_enabled: bool = False
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"
    quiet_hours_allow_urgent: bool = True


class AIBehaviorSection(BaseModel):
    """Write schema — accepted on PUT /settings. Contains the raw key field."""
    ai_response_length: AIResponseLength = "balanced"
    ai_personality: AIPersonality = "coach"
    ai_provider: str = "openai"
    ai_default_model: str = "gpt-5-mini"
    custom_api_key_enabled: bool = False
    custom_api_key: str = ""


class AIBehaviorSectionResponse(BaseModel):
    """Read schema — returned on GET /settings. Raw key is always redacted to empty string."""
    ai_response_length: AIResponseLength = "balanced"
    ai_personality: AIPersonality = "coach"
    ai_provider: str = "openai"
    ai_default_model: str = "gpt-5-mini"
    custom_api_key_enabled: bool = False
    custom_api_key: str = ""
    custom_api_key_saved: bool = False


class PlannerSection(BaseModel):
    week_starts_on: WeekStartsOn = "sunday"
    default_reminder_time: str = Field(default="21:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    default_task_duration_minutes: int = Field(default=30, ge=5, le=480)
    time_format: TimeFormat = "12h"
    date_format: DateFormat = "dd mmmm yyyy"


class PrivacySection(BaseModel):
    ai_memory_enabled: bool = True
    max_concurrent_devices: int = Field(default=2, ge=1, le=6)


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
    ai_behavior: AIBehaviorSectionResponse
    planner: PlannerSection
    privacy: PrivacySection
    accessibility: AccessibilitySection


class SettingsResponse(SettingsDBS):
    pass


# ─── AI Providers ─────────────────────────────────────────────────────────────


class AIModelResponse(BaseModel):
    name: str
    key: str


class AIProviderResponse(BaseModel):
    name: str
    key: str
    models: list[AIModelResponse]


class AIProviderHealthCheckRequest(BaseModel):
    provider: str
    model: str


class AIProviderHealthCheckResponse(BaseModel):
    healthy: bool
    message: str


class CustomApiKeyTestRequest(BaseModel):
    provider: str
    model: str
    api_key: str = Field(min_length=1)
