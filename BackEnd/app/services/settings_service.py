"""Settings domain service: app behavior and preferences."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import re
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constant import settings
from app.models.user import User
from app.models.user_setting import UserSetting
from app.schemas.settings import (
    AccessibilitySettings,
    AccessibilitySettingsUpdate,
    AIBehaviorSettings,
    AIBehaviorSettingsUpdate,
    AppearanceSettings,
    AppearanceSettingsUpdate,
    DynamicAppearanceResolveRead,
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
from app.services.exceptions import AppError

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

_DYNAMIC_APPEARANCE_CACHE_TTL_SECONDS = 300
_DYNAMIC_APPEARANCE_CACHE: dict[str, tuple[datetime, DynamicAppearanceResolveRead]] = {}


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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _build_dynamic_appearance_cache_key(latitude: float, longitude: float) -> str:
    # ~100m precision keeps cache hits high while preserving local sunrise/sunset behavior.
    return f"{round(latitude, 3)}:{round(longitude, 3)}"


def _get_cached_dynamic_appearance(
    *,
    latitude: float,
    longitude: float,
) -> DynamicAppearanceResolveRead | None:
    key = _build_dynamic_appearance_cache_key(latitude, longitude)
    cached = _DYNAMIC_APPEARANCE_CACHE.get(key)
    if cached is None:
        return None

    expires_at, payload = cached
    if _utcnow() >= expires_at:
        _DYNAMIC_APPEARANCE_CACHE.pop(key, None)
        return None
    return payload


def _cache_dynamic_appearance(
    *,
    latitude: float,
    longitude: float,
    payload: DynamicAppearanceResolveRead,
) -> None:
    key = _build_dynamic_appearance_cache_key(latitude, longitude)
    expires_at = _utcnow() + timedelta(seconds=_DYNAMIC_APPEARANCE_CACHE_TTL_SECONDS)
    _DYNAMIC_APPEARANCE_CACHE[key] = (expires_at, payload)


def _resolve_timezone(timezone_name: str) -> timezone | ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except Exception:
        return timezone.utc


def _parse_local_datetime(value: str, tz: timezone | ZoneInfo) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tz)
    return parsed.astimezone(tz)


def _extract_today_index(
    *,
    daily_dates: list[str],
    now_local: datetime,
) -> int:
    if not daily_dates:
        return 0

    local_today = now_local.date()
    for idx, value in enumerate(daily_dates):
        try:
            if date.fromisoformat(value) == local_today:
                return idx
        except ValueError:
            continue
    return 0


def _extract_next_transition(
    *,
    is_day: bool,
    now_local: datetime,
    sunrise_values: list[datetime],
    sunset_values: list[datetime],
) -> datetime:
    candidates = sunset_values if is_day else sunrise_values
    future_candidates = [value for value in candidates if value > now_local]
    if future_candidates:
        return min(future_candidates)

    # Should be rare with forecast_days=2; this keeps behavior stable on payload anomalies.
    return now_local + timedelta(hours=12)


def _fetch_open_meteo_dynamic_payload(*, latitude: float, longitude: float) -> dict[str, Any]:
    try:
        response = httpx.get(
            settings.open_meteo_base_url,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "is_day",
                "daily": "sunrise,sunset",
                "timezone": "auto",
                "forecast_days": 2,
            },
            timeout=settings.open_meteo_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except httpx.TimeoutException as exc:
        raise AppError("Dynamic appearance lookup timed out. Please try again.") from exc
    except httpx.HTTPError as exc:
        raise AppError("Couldn't resolve sunrise/sunset right now.") from exc
    except ValueError as exc:
        raise AppError("Received an invalid response while resolving dynamic appearance.") from exc

    if payload.get("error"):
        raise AppError("Couldn't resolve sunrise/sunset for this location.")

    return payload


def resolve_dynamic_appearance(*, latitude: float, longitude: float) -> DynamicAppearanceResolveRead:
    if latitude < -90 or latitude > 90:
        raise AppError("Latitude must be between -90 and 90.")
    if longitude < -180 or longitude > 180:
        raise AppError("Longitude must be between -180 and 180.")

    cached = _get_cached_dynamic_appearance(latitude=latitude, longitude=longitude)
    if cached is not None:
        return cached

    payload = _fetch_open_meteo_dynamic_payload(latitude=latitude, longitude=longitude)

    timezone_name = str(payload.get("timezone") or "UTC")
    tz = _resolve_timezone(timezone_name)
    now_local = _utcnow().astimezone(tz)

    daily = payload.get("daily") or {}
    sunrise_raw = daily.get("sunrise") or []
    sunset_raw = daily.get("sunset") or []
    daily_dates = daily.get("time") or []

    if not sunrise_raw or not sunset_raw:
        raise AppError("Sunrise/sunset data is unavailable for this location.")

    sunrise_values = [_parse_local_datetime(value, tz) for value in sunrise_raw]
    sunset_values = [_parse_local_datetime(value, tz) for value in sunset_raw]

    current = payload.get("current") or {}
    is_day_value = current.get("is_day")
    if is_day_value in (0, 1):
        is_day = bool(is_day_value)
    else:
        is_day = sunrise_values[0] <= now_local < sunset_values[0]

    next_transition_at = _extract_next_transition(
        is_day=is_day,
        now_local=now_local,
        sunrise_values=sunrise_values,
        sunset_values=sunset_values,
    )

    today_idx = _extract_today_index(daily_dates=daily_dates, now_local=now_local)
    sunrise_for_today = sunrise_values[min(today_idx, len(sunrise_values) - 1)]
    sunset_for_today = sunset_values[min(today_idx, len(sunset_values) - 1)]

    resolved = DynamicAppearanceResolveRead(
        effective_theme="light" if is_day else "dark",
        timezone=timezone_name,
        sunrise=sunrise_for_today,
        sunset=sunset_for_today,
        next_transition_at=next_transition_at,
    )
    _cache_dynamic_appearance(latitude=latitude, longitude=longitude, payload=resolved)
    return resolved


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
