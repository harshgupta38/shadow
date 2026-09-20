from fastapi import APIRouter

from app.api.deps import CurrentAdmin, DbSession
from app.core.endpoints import ENDPOINTS
from app.schemas.users import UserResponse
from app.services import users_service

router = APIRouter(prefix=ENDPOINTS.USERS.PREFIX, tags=["Users"])


@router.get(ENDPOINTS.USERS.SHADOW, response_model=list[UserResponse])
def get_shadow_users(_admin: CurrentAdmin):
    return users_service.list_shadow_users()


@router.get(ENDPOINTS.USERS.BACKOFFICE, response_model=list[UserResponse])
def get_backoffice_users(db: DbSession, _admin: CurrentAdmin):
    return users_service.list_backoffice_users(db)
