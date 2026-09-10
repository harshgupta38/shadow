import json

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.llm.enums import ClaudeModel, GeminiModel, OllamaModel, OpenAIModel
from app.models.chat import ConversationDBM
from app.models.user import UserDBM
from app.models.user_setting import UserSettingDBM
from app.schemas.settings import (
    AIModelDBS,
    AIProviderDBS,
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
    AIProviderDBS(
        name="Google Gemini",
        key="gemini",
        models=[AIModelDBS(name=m.replace("-", " ").title(), key=m) for m in GeminiModel],
    ),
    AIProviderDBS(
        name="OpenAI",
        key="openai",
        models=[AIModelDBS(name=m.replace("-", " ").title(), key=m) for m in OpenAIModel],
    ),
    AIProviderDBS(
        name="Anthropic Claude",
        key="claude",
        models=[AIModelDBS(name=m.replace("-", " ").title(), key=m) for m in ClaudeModel],
    ),
    AIProviderDBS(
        name="Ollama (Local)",
        key="ollama",
        models=[AIModelDBS(name=m.replace("-", " ").title(), key=m) for m in OllamaModel if m != OllamaModel.BASE_URL],
    ),
]


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
