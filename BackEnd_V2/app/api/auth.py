from fastapi import APIRouter, Depends, status
from app.core.endpoints import ENDPOINTS

from app.schemas.user import UserData
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest
from app.services import auth_service
from app.core import security

router = APIRouter(prefix=ENDPOINTS.AUTH.PREFIX, tags=["Authentication"])


@router.post(ENDPOINTS.AUTH.LOGIN, response_model=TokenResponse)
def login(data: LoginRequest, db = Depends(get_db)) -> TokenResponse:
    user = auth_service.login_user(db, str(data.email), data.password)
    return TokenResponse(access_token=security.create_access_token(subject=user.id))


@router.post(
    ENDPOINTS.AUTH.REGISTER, response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
def register(data: RegisterRequest, db = Depends(get_db)) -> TokenResponse:
    user = auth_service.register_user(db, data)
    return TokenResponse(access_token=security.create_access_token(subject=user.id))


@router.get(ENDPOINTS.AUTH.USER_DATA, response_model=UserData)
def me(current_user: User = Depends(get_current_user)) -> UserData:
    return current_user
