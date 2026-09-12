import json

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.llm.enums import ClaudeModel, GeminiModel, OllamaModel, OpenAIModel
from app.llm.config import llm_settings
from app.llm.exceptions import LLMError
from app.models.chat import ConversationDBM
from app.models.user import UserDBM
from app.models.user_setting import UserSettingDBM
from app.schemas.settings import (
    AIModelResponse,
    AIProviderHealthCheckResponse,
    AIProviderResponse,
    AppearanceSection,
    AIBehaviorSection,
    AccessibilitySection,
    NotificationsSection,
    PlannerSection,
    PrivacySection,
    SettingsDBS,
    SettingsResponse,
    UpdateSettingsRequest,
)

# ─── Defaults ────────────────────────────────────────────────────────────────

_DEFAULT_APPEARANCE = AppearanceSection().model_dump()
_DEFAULT_NOTIFICATIONS = NotificationsSection().model_dump()
_DEFAULT_AI_BEHAVIOR = AIBehaviorSection().model_dump()
_DEFAULT_PLANNER = PlannerSection().model_dump()
_DEFAULT_PRIVACY = PrivacySection().model_dump()
_DEFAULT_ACCESSIBILITY = AccessibilitySection().model_dump()

# ─── AI Provider catalogue ────────────────────────────────────────────────────

_AI_PROVIDERS: list[AIProviderResponse] = [
    AIProviderResponse(
        name="OpenAI",
        key="openai",
        models=[AIModelResponse(name=m.replace("-", " ").title(), key=m) for m in OpenAIModel],
    ),
    AIProviderResponse(
        name="Google Gemini",
        key="gemini",
        models=[AIModelResponse(name=m.replace("-", " ").title(), key=m) for m in GeminiModel],
    ),
    AIProviderResponse(
        name="Anthropic Claude",
        key="claude",
        models=[AIModelResponse(name=m.replace("-", " ").title(), key=m) for m in ClaudeModel],
    ),
]

if llm_settings.show_local_provider:
    _AI_PROVIDERS.append(AIProviderResponse(
        name="Ollama (Local)",
        key="ollama",
        models=[AIModelResponse(name=m.replace("-", " ").title(), key=m) for m in OllamaModel if m != OllamaModel.BASE_URL],
    ))


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _get_or_create(db: Session, user_id: int) -> UserSettingDBM:
    setting = db.scalar(
        select(UserSettingDBM).where(UserSettingDBM.user_id == user_id)
    )
    if setting is None:
        setting = UserSettingDBM(
            user_id=user_id,
            appearance=_DEFAULT_APPEARANCE,
            notifications=_DEFAULT_NOTIFICATIONS,
            ai_behavior=_DEFAULT_AI_BEHAVIOR,
            planner=_DEFAULT_PLANNER,
            privacy=_DEFAULT_PRIVACY,
            accessibility=_DEFAULT_ACCESSIBILITY,
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


def _to_response(setting: UserSettingDBM) -> SettingsResponse:
    return SettingsResponse.model_validate(setting)


# ─── Service functions ────────────────────────────────────────────────────────


def get_theme_preference(db: Session, user_id: int) -> str:
    """Lightweight read used by /auth/my-data — does NOT create a default row."""
    setting = db.scalar(
        select(UserSettingDBM).where(UserSettingDBM.user_id == user_id)
    )
    if setting is None:
        return _DEFAULT_APPEARANCE["theme_preference"]
    return str(setting.appearance.get("theme_preference", _DEFAULT_APPEARANCE["theme_preference"]))


def get_week_starts_on(db: Session, user_id: int) -> str:
    """Lightweight read — returns 'monday' or 'sunday' without creating a default row."""
    setting = db.scalar(
        select(UserSettingDBM).where(UserSettingDBM.user_id == user_id)
    )
    if setting is None:
        return _DEFAULT_PLANNER["week_starts_on"]
    return str(setting.planner.get("week_starts_on", _DEFAULT_PLANNER["week_starts_on"]))


def get_startup_settings(db: Session, user_id: int) -> dict:
    """Lightweight read for /auth/my-data — returns theme + planner defaults without creating a row."""
    setting = db.scalar(
        select(UserSettingDBM).where(UserSettingDBM.user_id == user_id)
    )
    if setting is None:
        return {
            "theme_preference": _DEFAULT_APPEARANCE["theme_preference"],
            "planner": _DEFAULT_PLANNER,
        }
    return {
        "theme_preference": setting.appearance.get("theme_preference", _DEFAULT_APPEARANCE["theme_preference"]),
        "planner": {**_DEFAULT_PLANNER, **setting.planner},
    }


def get_ai_behavior(db: Session, user_id: int) -> dict:
    """Single read for all ai_behavior fields used by chat. Does NOT create a default row."""
    setting = db.scalar(
        select(UserSettingDBM).where(UserSettingDBM.user_id == user_id)
    )
    if setting is None:
        return dict(_DEFAULT_AI_BEHAVIOR)
    return {**_DEFAULT_AI_BEHAVIOR, **setting.ai_behavior}


def get_settings(db: Session, current_user: UserDBM) -> SettingsResponse:
    setting = _get_or_create(db, current_user.id)
    return _to_response(setting)


def update_settings(
    db: Session,
    current_user: UserDBM,
    data: UpdateSettingsRequest,
) -> SettingsResponse:
    setting = _get_or_create(db, current_user.id)

    setting.appearance = data.appearance.model_dump()
    setting.notifications = data.notifications.model_dump()
    setting.ai_behavior = data.ai_behavior.model_dump()
    setting.planner = data.planner.model_dump()
    setting.privacy = data.privacy.model_dump()
    setting.accessibility = data.accessibility.model_dump()

    db.commit()
    db.refresh(setting)
    return _to_response(setting)


def get_ai_providers() -> list[AIProviderResponse]:
    return _AI_PROVIDERS


def export_user_data(db: Session, current_user: UserDBM) -> bytes:
    setting = _get_or_create(db, current_user.id)
    payload = {
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
        },
        "settings": SettingsDBS.model_validate(setting).model_dump(),
    }
    return json.dumps(payload, indent=2).encode()


def clear_chat_history(db: Session, current_user: UserDBM) -> None:
    db.execute(
        delete(ConversationDBM).where(ConversationDBM.user_id == current_user.id)
    )
    db.commit()


async def check_provider_health(provider: str, model: str) -> AIProviderHealthCheckResponse:
    from app.llm.service import get_llm_service_for_user

    service = get_llm_service_for_user(provider)
    try:
        await service.health_check(model=model)
        return AIProviderHealthCheckResponse(healthy=True, message="Connected successfully.")
    except LLMError as exc:
        return AIProviderHealthCheckResponse(healthy=False, message=str(exc))
    except Exception as exc:
        return AIProviderHealthCheckResponse(healthy=False, message=f"Unexpected error: {exc}")
