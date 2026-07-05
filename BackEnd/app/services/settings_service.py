"""Settings domain service: app behavior and preferences."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_setting import UserSetting
from app.schemas.settings import (
    AccessibilitySettings,
    AccessibilitySettingsUpdate,
    AIBehaviorSettings,
    AIBehaviorSettingsUpdate,
    AppearanceSettings,
    AppearanceSettingsUpdate,
    IntegrationSettings,
    IntegrationSettingsUpdate,
    NotificationSettings,
    NotificationSettingsUpdate,
    PlannerSettings,
    PlannerSettingsUpdate,
    PrivacySettings,
    PrivacySettingsUpdate,
    SettingsRead,
)

_AUTO_MODEL = "auto"
_DEFAULT_RUNTIME_GEMINI_MODEL = "gemini-2.5-flash"
_RETIRED_GEMINI_MODELS = {
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2-flash",
    "gemini-2-flash-lite",
}


def normalize_ai_default_model(value: str | None) -> str:
    """Normalize user-entered model aliases to canonical slug form.

    Examples:
    - "Gemini 3.5" -> "gemini-3.5"
    - "gemini_2.5_flash" -> "gemini-2.5-flash"
    - "auto" / empty -> "auto"

    Retired model slugs are remapped to the current supported default.
    """
    if value is None:
        return _AUTO_MODEL

    normalized = " ".join(value.strip().lower().split())
    if not normalized or normalized in {_AUTO_MODEL, "default"}:
        return _AUTO_MODEL

    normalized = normalized.replace("_", "-")
    normalized = re.sub(r"\s*-\s*", "-", normalized)
    normalized = normalized.replace(" ", "-")
    normalized = re.sub(r"^gemini(?=\d)", "gemini-", normalized)
    if normalized in _RETIRED_GEMINI_MODELS:
        return _DEFAULT_RUNTIME_GEMINI_MODEL
    return normalized


def resolve_runtime_ai_model(value: str | None) -> str | None:
    """Resolve the effective runtime model or None for default auto behavior."""
    normalized = normalize_ai_default_model(value)
    return None if normalized == _AUTO_MODEL else normalized


def get_effective_ai_model(db: Session, user: User) -> str | None:
    """Return the model override to pass to providers for this user."""
    settings = _get_or_create_settings(db, user)
    return resolve_runtime_ai_model(settings.ai_default_model)


def _get_or_create_settings(db: Session, user: User) -> UserSetting:
    settings = db.scalar(select(UserSetting).where(UserSetting.user_id == user.id))
    if settings is not None:
        return settings

    settings = UserSetting(user_id=user.id, theme_preference=user.theme_preference)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def get_user_settings_row(db: Session, user: User) -> UserSetting:
    """Return raw settings row for runtime checks (creates defaults if missing)."""
    return _get_or_create_settings(db, user)


def get_settings(db: Session, user: User) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    return SettingsRead(
        appearance=AppearanceSettings(theme_preference=settings.theme_preference),
        notifications=NotificationSettings(
            notifications_enabled=settings.notifications_enabled,
            push_notifications_enabled=settings.push_notifications_enabled,
            email_notifications_enabled=settings.email_notifications_enabled,
            reminder_notifications_enabled=settings.reminder_notifications_enabled,
            daily_brief_enabled=settings.daily_brief_enabled,
            daily_brief_time=settings.daily_brief_time,
            weekly_summary_enabled=settings.weekly_summary_enabled,
        ),
        ai_behavior=AIBehaviorSettings(
            ai_response_length=settings.ai_response_length,
            ai_personality=settings.ai_personality,
            ai_default_model=normalize_ai_default_model(settings.ai_default_model),
            ai_suggestions_enabled=settings.ai_suggestions_enabled,
            smart_planning_enabled=settings.smart_planning_enabled,
        ),
        planner=PlannerSettings(
            week_starts_on=settings.week_starts_on,
            default_reminder_time=settings.default_reminder_time,
            default_task_duration_minutes=settings.default_task_duration_minutes,
            time_format=settings.time_format,
            date_format=settings.date_format,
        ),
        privacy=PrivacySettings(
            analytics_opt_out=settings.analytics_opt_out,
            ai_memory_enabled=settings.ai_memory_enabled,
        ),
        integrations=IntegrationSettings(
            google_calendar_enabled=settings.integration_google_calendar_enabled,
            slack_enabled=settings.integration_slack_enabled,
        ),
        accessibility=AccessibilitySettings(
            reduced_motion=settings.accessibility_reduced_motion,
            high_contrast=settings.accessibility_high_contrast,
            font_scale_percent=settings.accessibility_font_scale_percent,
        ),
    )


def update_appearance(
    db: Session, user: User, data: AppearanceSettingsUpdate
) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    settings.theme_preference = data.theme_preference
    # Keep legacy user.theme_preference in sync for existing auth/theme flows.
    user.theme_preference = data.theme_preference
    db.commit()
    db.refresh(settings)
    db.refresh(user)
    return get_settings(db, user)


def update_notifications(
    db: Session, user: User, data: NotificationSettingsUpdate
) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return get_settings(db, user)


def update_ai_behavior(
    db: Session, user: User, data: AIBehaviorSettingsUpdate
) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    updates = data.model_dump(exclude_unset=True)
    if "ai_default_model" in updates:
        updates["ai_default_model"] = normalize_ai_default_model(updates["ai_default_model"])

    for field, value in updates.items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return get_settings(db, user)


def update_integrations(
    db: Session, user: User, data: IntegrationSettingsUpdate
) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    updates = data.model_dump(exclude_unset=True)
    mapping = {
        "google_calendar_enabled": "integration_google_calendar_enabled",
        "slack_enabled": "integration_slack_enabled",
    }
    for field, value in updates.items():
        setattr(settings, mapping[field], value)
    db.commit()
    db.refresh(settings)
    return get_settings(db, user)


def update_accessibility(
    db: Session, user: User, data: AccessibilitySettingsUpdate
) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    updates = data.model_dump(exclude_unset=True)
    mapping = {
        "reduced_motion": "accessibility_reduced_motion",
        "high_contrast": "accessibility_high_contrast",
        "font_scale_percent": "accessibility_font_scale_percent",
    }
    for field, value in updates.items():
        setattr(settings, mapping[field], value)
    db.commit()
    db.refresh(settings)
    return get_settings(db, user)


def update_planner(
    db: Session, user: User, data: PlannerSettingsUpdate
) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return get_settings(db, user)


def update_privacy(db: Session, user: User, data: PrivacySettingsUpdate) -> SettingsRead:
    settings = _get_or_create_settings(db, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return get_settings(db, user)
