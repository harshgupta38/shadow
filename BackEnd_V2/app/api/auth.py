from jose import JWTError

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import AuthError
from app.services import rate_limit_service
from app.schemas.session import RenameSessionRequest, SessionsListResponse
from app.schemas.user import UserDataResponse
from app.schemas.settings import AccessibilitySection, PlannerSection
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest
from app.services import auth_service, settings_service, session_service, notifications_service
from app.core import security

router = APIRouter(prefix=ENDPOINTS.AUTH.PREFIX, tags=["Authentication"])

# ─── Cookie helpers ───────────────────────────────────────────────────────────

# secure is derived from same_site: SameSite=None is only honored by browsers
# when Secure=True, and there's no reason to want Secure without None (a
# same-site cookie doesn't need Secure to reach the same origin over dev HTTP).
_COOKIE_OPTS: dict = dict(
    httponly=True,
    samesite=settings.same_site,
    secure=settings.same_site == "none",
    path="/",
)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,
        **_COOKIE_OPTS,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 86400,
        **_COOKIE_OPTS,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def _session_id_from_token(request: Request) -> int | None:
    """Extracts session_id from the access_token cookie without hitting the DB."""
    token = request.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = security.decode_access_token(token)
        sid = payload.get("sid")
        return int(sid) if sid is not None else None
    except Exception:
        return None


def _build_token_response(db, user_id: int, request: Request, response: Response) -> TokenResponse:
    """Creates a session, issues tokens as httpOnly cookies, checks device limit."""
    sess = session_service.create_session(db, user_id, request)
    access_token = security.create_access_token(subject=user_id, session_id=sess.id)
    refresh_token = security.create_refresh_token(subject=user_id, session_id=sess.id)
    session_service.set_refresh_token_hash(sess, refresh_token)
    db.commit()

    _set_auth_cookies(response, access_token, refresh_token)

    user = db.get(UserDBM, user_id)
    if user:
        notifications_service.create_notification(
            db,
            user,
            title="New sign-in detected",
            body=f"A new session was started from {sess.device_name} ({sess.browser} on {sess.os_name}).",
            type="system",
            priority=1,
            event_key=f"signin:{sess.id}",
        )

    max_devices = settings_service.get_max_concurrent_devices(db, user_id)
    count = session_service.get_session_count(db, user_id, include_session_id=sess.id)
    sessions = session_service.get_sessions(db, user_id, current_session_id=sess.id)

    return TokenResponse(
        session_limit_exceeded=count > max_devices,
        sessions=sessions,
        current_session_id=sess.id,
        max_concurrent_devices=max_devices,
    )


# ─── Login / Register / Refresh ───────────────────────────────────────────────

@router.post(ENDPOINTS.AUTH.LOGIN, response_model=TokenResponse)
def login(data: LoginRequest, request: Request, response: Response, db=Depends(get_db)) -> TokenResponse:
    ip = request.client.host if request.client else "unknown"
    rate_limit_service.check_login_allowed(db, ip)
    try:
        user = auth_service.login_user(db, str(data.email), data.password)
    except AuthError:
        rate_limit_service.on_login_failure(db, ip)
        db.commit()
        raise
    rate_limit_service.on_login_success(db, ip)
    return _build_token_response(db, user.id, request, response)


@router.post(
    ENDPOINTS.AUTH.REGISTER,
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest, request: Request, response: Response, db=Depends(get_db)) -> TokenResponse:
    ip = request.client.host if request.client else "unknown"
    rate_limit_service.check_registration_allowed(db, ip)
    user = auth_service.register_user(db, data)
    rate_limit_service.on_registration(db, ip)
    return _build_token_response(db, user.id, request, response)


@router.post(ENDPOINTS.AUTH.REFRESH, response_model=TokenResponse)
def refresh(request: Request, response: Response, db=Depends(get_db)) -> TokenResponse:
    old_refresh = request.cookies.get("refresh_token")
    if not old_refresh:
        raise AuthError("No refresh token — please log in again")

    try:
        payload = security.decode_refresh_token(old_refresh)
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

    rotated = session_service.rotate_refresh_token_hash(
        db, session_id, user_id, old_refresh, new_refresh
    )
    if not rotated:
        # CAS failed: concurrent rotation beat us, or an old token was replayed.
        session_service.revoke_session(db, session_id, user_id)
        raise AuthError("Refresh token already used — please log in again")

    _set_auth_cookies(response, new_access, new_refresh)
    return TokenResponse()


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post(ENDPOINTS.AUTH.LOGOUT, status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db=Depends(get_db)) -> None:
    _clear_auth_cookies(response)

    # Prefer the access token, but it's short-lived and may already have expired
    # by the time logout fires — fall back to the refresh token (same "sid"
    # claim, ~30-day lifetime) so an expired access token doesn't leave the
    # session row behind forever in Active Sessions.
    for token, decode in (
        (request.cookies.get("access_token"), security.decode_access_token),
        (request.cookies.get("refresh_token"), security.decode_refresh_token),
    ):
        if not token:
            continue
        try:
            payload = decode(token)
            session_id = int(payload.get("sid", 0)) or None
            user_id = int(payload.get("sub", 0))
            if session_id:
                session_service.revoke_session(db, session_id, user_id)
                return
        except Exception:
            continue


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
    request: Request,
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


@router.patch(ENDPOINTS.AUTH.SESSION_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def rename_session(
    session_id: int,
    data: RenameSessionRequest,
    current_user: UserDBM = Depends(get_current_user),
    db=Depends(get_db),
) -> None:
    ok = session_service.rename_session(db, session_id, current_user.id, data.custom_name)
    if not ok:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Session not found")


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
