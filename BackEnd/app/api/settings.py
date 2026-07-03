"""Settings routes (application behavior configuration)."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.settings import (
    AccessibilitySettingsUpdate,
    AIBehaviorSettingsUpdate,
    AppearanceSettingsUpdate,
    IntegrationSettingsUpdate,
    NotificationSettingsUpdate,
    PlannerSettingsUpdate,
    PrivacySettingsUpdate,
    SettingsRead,
)
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsRead)
def get_settings(db: DbSession, current_user: CurrentUser) -> SettingsRead:
    return settings_service.get_settings(db, current_user)


@router.put("/appearance", response_model=SettingsRead)
def update_appearance(
    data: AppearanceSettingsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SettingsRead:
    return settings_service.update_appearance(db, current_user, data)


@router.put("/notifications", response_model=SettingsRead)
def update_notifications(
    data: NotificationSettingsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SettingsRead:
    return settings_service.update_notifications(db, current_user, data)


@router.put("/ai-behavior", response_model=SettingsRead)
def update_ai_behavior(
    data: AIBehaviorSettingsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SettingsRead:
    return settings_service.update_ai_behavior(db, current_user, data)


@router.put("/integrations", response_model=SettingsRead)
def update_integrations(
    data: IntegrationSettingsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SettingsRead:
    return settings_service.update_integrations(db, current_user, data)


@router.put("/accessibility", response_model=SettingsRead)
def update_accessibility(
    data: AccessibilitySettingsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SettingsRead:
    return settings_service.update_accessibility(db, current_user, data)


@router.put("/planner", response_model=SettingsRead)
def update_planner(
    data: PlannerSettingsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SettingsRead:
    return settings_service.update_planner(db, current_user, data)


@router.put("/privacy", response_model=SettingsRead)
def update_privacy(
    data: PrivacySettingsUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> SettingsRead:
    return settings_service.update_privacy(db, current_user, data)
