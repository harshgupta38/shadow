from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.settings import AIProviderResponse, SettingsResponse, UpdateSettingsRequest
from app.services import settings_service

router = APIRouter(prefix=ENDPOINTS.SETTINGS.PREFIX, tags=["Settings"])


@router.get("", response_model=SettingsResponse)
def get_settings(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> SettingsResponse:
    return settings_service.get_settings(db, current_user)


@router.put("", response_model=SettingsResponse)
def update_settings(
    data: UpdateSettingsRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> SettingsResponse:
    return settings_service.update_settings(db, current_user, data)


@router.get(ENDPOINTS.SETTINGS.AI_PROVIDERS, response_model=list[AIProviderResponse])
def get_ai_providers() -> list[AIProviderResponse]:
    return settings_service.get_ai_providers()


@router.get(ENDPOINTS.SETTINGS.EXPORT)
def export_user_data(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    data = settings_service.export_user_data(db, current_user)
    return Response(
        content=data,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=shadow-export.json"},
    )


@router.delete(ENDPOINTS.SETTINGS.CHAT_HISTORY, status_code=204)
def clear_chat_history(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    settings_service.clear_chat_history(db, current_user)
