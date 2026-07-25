from fastapi import APIRouter, status

from app.schemas.user import UserData
from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest
from app.services import auth_service
from app.core import security

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: DbSession) -> TokenResponse:
    user = auth_service.login_user(db, str(data.email), data.password)
    return TokenResponse(access_token=security.create_access_token(subject=user.id))


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
def register(data: RegisterRequest, db: DbSession) -> TokenResponse:
    user = auth_service.register_user(db, data)
    return TokenResponse(access_token=security.create_access_token(subject=user.id))


@router.get("/me", response_model=UserData)
def me(current_user: CurrentUser) -> UserData:
    return current_user
