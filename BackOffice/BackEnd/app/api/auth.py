from fastapi import APIRouter

from app.api.deps import CurrentAdmin, DbSession
from app.core import security
from app.core.endpoints import ENDPOINTS
from app.schemas.auth import AdminUserResponse, LoginRequest, LoginResponse
from app.services import auth_service

router = APIRouter(prefix=ENDPOINTS.AUTH.PREFIX, tags=["Authentication"])


@router.post(ENDPOINTS.AUTH.LOGIN, response_model=LoginResponse)
def login(body: LoginRequest, db: DbSession):
    admin = auth_service.authenticate(db, body.email, body.password)
    token = security.create_access_token(admin.id)
    # Handed back in the body, not a Set-Cookie — the frontend (Firebase
    # Hosting) and this API are different origins, so a cookie here is a
    # third-party cookie that Chrome Incognito and mobile Safari block
    # outright regardless of SameSite. The frontend stores this itself and
    # attaches it as a Bearer header, which has no such policy to run into.
    return LoginResponse(admin=admin, access_token=token)


@router.post(ENDPOINTS.AUTH.LOGOUT)
def logout():
    # Stateless JWTs — there's no server-side session to invalidate, this
    # just gives the frontend a symmetrical endpoint to call; it's the
    # frontend discarding its own stored token that actually logs out.
    return {"message": "Logged out."}


@router.get(ENDPOINTS.AUTH.ME, response_model=AdminUserResponse)
def me(admin: CurrentAdmin):
    return admin
