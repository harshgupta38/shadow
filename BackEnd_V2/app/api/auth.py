from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.endpoints import ENDPOINTS
from app.core.exceptions import AuthError
from app.schemas.session import SessionsListResponse
from app.schemas.user import UserDataResponse
from app.schemas.settings import AccessibilitySection, PlannerSection
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest, RefreshRequest
from app.services import auth_service, settings_service, session_service, notifications_service
from app.core import security

router = APIRouter(prefix=ENDPOINTS.AUTH.PREFIX, tags=["Authentication"])

_bearer = HTTPBearer(auto_error=False)


def _session_id_from_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> int | None:
    """Extracts session_id from an access token without hitting the DB."""
    if not credentials or not credentials.credentials:
        return None
    try:
        payload = security.decode_access_token(credentials.credentials)
        sid = payload.get("sid")
        return int(sid) if sid is not None else None
    except Exception:
        return None


def _build_token_response(db, user_id: int, request: Request) -> TokenResponse:
    """Creates a session, issues tokens, checks device limit, returns full response."""
    sess = session_service.create_session(db, user_id, request)
    access_token = security.create_access_token(subject=user_id, session_id=sess.id)
    refresh_token = security.create_refresh_token(subject=user_id, session_id=sess.id)
    db.commit()

    user = db.get(UserDBM, user_id)
    if user:
        notifications_service.create_notification(
            db,
            user,
            title="New sign-in detected",
            body=f"A new session was started from {sess.device_name} ({sess.browser} on {sess.os_name}).",
            type="system",
            priority=1,
        )

    max_devices = settings_service.get_max_concurrent_devices(db, user_id)
    count = session_service.get_session_count(db, user_id)
    sessions = session_service.get_sessions(db, user_id, current_session_id=sess.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        session_limit_exceeded=count > max_devices,
        sessions=sessions,
        current_session_id=sess.id,
        max_concurrent_devices=max_devices,
    )


# ─── Login / Register / Refresh ───────────────────────────────────────────────

@router.post(ENDPOINTS.AUTH.LOGIN, response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db=Depends(get_db)) -> TokenResponse:
    user = auth_service.login_user(db, str(data.email), data.password)
    return _build_token_response(db, user.id, request)


@router.post(
    ENDPOINTS.AUTH.REGISTER,
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest, request: Request, db=Depends(get_db)) -> TokenResponse:
    user = auth_service.register_user(db, data)
    return _build_token_response(db, user.id, request)


@router.post(ENDPOINTS.AUTH.REFRESH, response_model=TokenResponse)
def refresh(data: RefreshRequest, db=Depends(get_db)) -> TokenResponse:
    try:
        payload = security.decode_refresh_token(data.refresh_token)
        user_id = int(payload["sub"])
        session_id = int(payload.get("sid", 0)) or None
    except (JWTError, TypeError, ValueError, KeyError):
        raise AuthError("Invalid or expired refresh token")

    user = db.get(UserDBM, user_id)
    if not user:
        raise AuthError("User not found")

    if session_id is None:
        raise AuthError("Session not found — please log in again")

    from app.models.active_session import ActiveSessionDBM
    sess = db.get(ActiveSessionDBM, session_id)
    if sess is None or sess.user_id != user_id:
        raise AuthError("Session has been revoked — please log in again")

    new_access = security.create_access_token(subject=user_id, session_id=session_id)
    new_refresh = security.create_refresh_token(subject=user_id, session_id=session_id)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post(ENDPOINTS.AUTH.LOGOUT, status_code=status.HTTP_204_NO_CONTENT)
def logout(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db=Depends(get_db),
) -> None:
    if not credentials or not credentials.credentials:
        return
    try:
        payload = security.decode_access_token(credentials.credentials)
        session_id = int(payload.get("sid", 0)) or None
        user_id = int(payload.get("sub", 0))
        if session_id:
            session_service.revoke_session(db, session_id, user_id)
    except Exception:
        pass


# ─── User data ────────────────────────────────────────────────────────────────

@router.get(ENDPOINTS.AUTH.USER_DATA, response_model=UserDataResponse)
def me(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> UserDataResponse:
    startup = settings_service.get_startup_settings(db, current_user.id)
    max_devices = settings_service.get_max_concurrent_devices(db, current_user.id)
    session_count = session_service.get_session_count(db, current_user.id)
    return UserDataResponse(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        theme_preference=startup["theme_preference"],
        planner=PlannerSection(**startup["planner"]),
        accessibility=AccessibilitySection(**startup["accessibility"]),
        session_limit_exceeded=session_count > max_devices,
    )


# ─── Session management ───────────────────────────────────────────────────────

@router.get(ENDPOINTS.AUTH.SESSIONS, response_model=SessionsListResponse)
def list_sessions(
    current_user: UserDBM = Depends(get_current_user),
    current_session_id: int | None = Depends(_session_id_from_token),
    db=Depends(get_db),
) -> SessionsListResponse:
    sessions = session_service.get_sessions(db, current_user.id, current_session_id)
    max_devices = settings_service.get_max_concurrent_devices(db, current_user.id)
    return SessionsListResponse(
        sessions=sessions,
        current_session_id=current_session_id,
        max_concurrent_devices=max_devices,
        session_limit_exceeded=len(sessions) > max_devices,
    )


@router.delete(ENDPOINTS.AUTH.SESSION_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: int,
    current_user: UserDBM = Depends(get_current_user),
    db=Depends(get_db),
) -> None:
    revoked = session_service.revoke_session(db, session_id, current_user.id)
    if not revoked:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Session not found")
    from app.services.session_event_service import notify_session_logout
    notify_session_logout(session_id)


@router.get(ENDPOINTS.AUTH.SESSION_EVENTS)
async def session_events(
    request: Request,
    current_user: UserDBM = Depends(get_current_user),
    current_session_id: int | None = Depends(_session_id_from_token),
) -> StreamingResponse:
    if current_session_id is None:
        raise AuthError("No valid session")
    from app.services.session_event_service import session_event_stream
    from app.api.notifications import _shutdown as _sse_shutdown
    return StreamingResponse(
        session_event_stream(current_session_id, _sse_shutdown),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
