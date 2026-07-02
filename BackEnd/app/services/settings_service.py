"""Settings domain service: app behavior and preferences."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_setting import UserSetting
from app.schemas.settings import (
    AIBehaviorSettings,
    AIBehaviorSettingsUpdate,
    AppearanceSettings,
    AppearanceSettingsUpdate,
    NotificationSettings,
    NotificationSettingsUpdate,
    PlannerSettings,
    PlannerSettingsUpdate,
    PrivacySettings,
    PrivacySettingsUpdate,
    SettingsRead,
)


def _get_or_create_settings(db: Session, user: User) -> UserSetting:
    settings = db.scalar(select(UserSetting).where(UserSetting.user_id == user.id))
    if settings is not None:
        return settings

    settings = UserSetting(user_id=user.id, theme_preference=user.theme_preference)
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


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
        ),
        ai_behavior=AIBehaviorSettings(
            ai_response_length=settings.ai_response_length,
            ai_personality=settings.ai_personality,
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
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
