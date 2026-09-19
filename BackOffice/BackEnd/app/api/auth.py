from fastapi import APIRouter, Response

from app.api.deps import COOKIE_NAME, CurrentAdmin, DbSession
from app.core import security
from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.schemas.auth import AdminUserResponse, LoginRequest
from app.services import auth_service

router = APIRouter(prefix=ENDPOINTS.AUTH.PREFIX, tags=["Authentication"])

# secure is derived from same_site, matching BackEnd_V2's own convention:
# SameSite=None is only honored by browsers when Secure=True.
_COOKIE_OPTS: dict = dict(
    httponly=True,
    samesite=settings.same_site,
    secure=settings.same_site == "none",
    path="/",
)


@router.post(ENDPOINTS.AUTH.LOGIN, response_model=AdminUserResponse)
def login(body: LoginRequest, response: Response, db: DbSession):
    admin = auth_service.authenticate(db, body.username, body.password)
    token = security.create_access_token(admin.id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        **_COOKIE_OPTS,
    )
    return admin


@router.post(ENDPOINTS.AUTH.LOGOUT)
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"message": "Logged out."}


@router.get(ENDPOINTS.AUTH.ME, response_model=AdminUserResponse)
def me(admin: CurrentAdmin):
    return admin
