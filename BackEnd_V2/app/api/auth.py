from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError
from app.core.endpoints import ENDPOINTS

from app.schemas.user import UserDataResponse
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest, RefreshRequest
from app.services import auth_service
from app.core import security

router = APIRouter(prefix=ENDPOINTS.AUTH.PREFIX, tags=["Authentication"])


def _make_token_response(user_id: int) -> TokenResponse:
    return TokenResponse(
        access_token=security.create_access_token(subject=user_id),
        refresh_token=security.create_refresh_token(subject=user_id),
    )


@router.post(ENDPOINTS.AUTH.LOGIN, response_model=TokenResponse)
def login(data: LoginRequest, db=Depends(get_db)) -> TokenResponse:
    user = auth_service.login_user(db, str(data.email), data.password)
    return _make_token_response(user.id)


@router.post(
    ENDPOINTS.AUTH.REGISTER,
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest, db=Depends(get_db)) -> TokenResponse:
    user = auth_service.register_user(db, data)
    return _make_token_response(user.id)


@router.post(ENDPOINTS.AUTH.REFRESH, response_model=TokenResponse)
def refresh(data: RefreshRequest, db=Depends(get_db)) -> TokenResponse:
    try:
        payload = security.decode_refresh_token(data.refresh_token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user = db.get(UserDBM, int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return _make_token_response(user.id)


@router.get(ENDPOINTS.AUTH.USER_DATA, response_model=UserDataResponse)
def me(current_user: UserDBM = Depends(get_current_user)) -> UserDataResponse:
    return current_user
