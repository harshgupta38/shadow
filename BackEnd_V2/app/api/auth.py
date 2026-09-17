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
from app.schemas.auth import (
    AccountPasswordConfirmRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateNameRequest,
)
from app.services import auth_service, settings_service, session_service
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
    """Creates a session, issues tokens as httpOnly cookies, checks device limit.

    The "New sign-in detected" notification is NOT sent here — a session
    created here may never actually get used (e.g. cookies blocked cross-site),
    which would be a misleading "you signed in" alert for a login that visibly
    failed on the user's screen. It's sent instead from
    session_service.update_last_seen() the first time this session is
    confirmed by successfully authenticating a request.
    """
    sess = session_service.create_session(db, user_id, request)
    access_token = security.create_access_token(subject=user_id, session_id=sess.id)
    refresh_token = security.create_refresh_token(subject=user_id, session_id=sess.id)
    session_service.set_refresh_token_hash(sess, refresh_token)
    db.commit()

    _set_auth_cookies(response, access_token, refresh_token)

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
        user = auth_service.login_user(db, str(data.email), data.password, request)
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


# ─── Forgot / reset password ───────────────────────────────────────────────────
# Both unauthenticated by design — the whole point is recovering access
# without a valid session. Identity is proven by the emailed token instead.

@router.post(ENDPOINTS.AUTH.FORGOT_PASSWORD, status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(data: ForgotPasswordRequest, request: Request, db=Depends(get_db)) -> None:
    ip = request.client.host if request.client else "unknown"
    rate_limit_service.check_forgot_password_allowed(db, ip)
    auth_service.request_password_reset(db, data.email)
    rate_limit_service.on_forgot_password_request(db, ip)


@router.post(ENDPOINTS.AUTH.RESET_PASSWORD, status_code=status.HTTP_204_NO_CONTENT)
def reset_password(data: ResetPasswordRequest, db=Depends(get_db)) -> None:
    auth_service.reset_password(db, data.uid, data.token, data.new_password)


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

def _build_user_data_response(db, user: UserDBM) -> UserDataResponse:
    startup = settings_service.get_startup_settings(db, user.id)
    max_devices = settings_service.get_max_concurrent_devices(db, user.id)
    session_count = session_service.get_session_count(db, user.id)
    return UserDataResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        theme_preference=startup["theme_preference"],
        planner=PlannerSection(**startup["planner"]),
        accessibility=AccessibilitySection(**startup["accessibility"]),
        session_limit_exceeded=session_count > max_devices,
    )


@router.get(ENDPOINTS.AUTH.USER_DATA, response_model=UserDataResponse)
def me(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> UserDataResponse:
    return _build_user_data_response(db, current_user)


@router.patch(ENDPOINTS.AUTH.NAME, response_model=UserDataResponse)
def update_name(
    data: UpdateNameRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> UserDataResponse:
    auth_service.update_name(db, current_user, data.name)
    return _build_user_data_response(db, current_user)


@router.post(ENDPOINTS.AUTH.CHANGE_PASSWORD, status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    data: ChangePasswordRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
    current_session_id: int | None = Depends(_session_id_from_token),
) -> None:
    auth_service.change_password(db, current_user, data.current_password, data.new_password)
    # Cuts off any other signed-in device (e.g. one an attacker hijacked —
    # the classic reason to force a password change) while leaving the
    # device that just made this request logged in.
    session_service.revoke_other_sessions(db, current_user.id, current_session_id)


@router.post(ENDPOINTS.AUTH.RESEND_VERIFICATION, status_code=status.HTTP_204_NO_CONTENT)
def resend_verification(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    auth_service.resend_verification_email(db, current_user)


def _verify_email_page(message: str, success: bool = True) -> str:
    color = "#22c55e" if success else "#ef4444"
    icon = "&#10003;" if success else "&#9888;"
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Shadow — Verify email</title>
<style>body{{margin:0;background:#efeff7;font-family:Verdana,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}}
.box{{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px 36px;max-width:420px;text-align:center}}
.icon{{font-size:42px;color:{color}}}h2{{margin:16px 0 8px;color:#111827}}p{{color:#4b5563;font-size:14px;line-height:1.6}}</style></head>
<body><div class="box"><div class="icon">{icon}</div><h2>Shadow</h2><p>{message}</p></div></body></html>"""


@router.get(ENDPOINTS.AUTH.VERIFY_EMAIL, response_class=None)
def verify_email(uid: int, token: str, db=Depends(get_db)):
    """One-click verification link embedded in the verification email — no
    auth cookie required, same pattern as notifications.email_unsubscribe."""
    from fastapi.responses import HTMLResponse
    from app.services.email_notification_service import verify_verification_token

    user = db.get(UserDBM, uid)
    if not user or not verify_verification_token(uid, user.email, token):
        return HTMLResponse(
            content=_verify_email_page("Invalid or expired verification link.", success=False),
            status_code=400,
        )

    if not user.email_verified:
        user.email_verified = True
        db.commit()

    return HTMLResponse(
        content=_verify_email_page(f"Your email has been verified, {user.name.split()[0]}! You can close this tab and return to Shadow.")
    )


# ─── Danger zone ────────────────────────────────────────────────────────────────

@router.post(ENDPOINTS.AUTH.DEACTIVATE, status_code=status.HTTP_204_NO_CONTENT)
def deactivate_account(
    data: AccountPasswordConfirmRequest,
    response: Response,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    auth_service.deactivate_account(db, current_user, data.current_password)
    session_service.revoke_all_sessions(db, current_user.id)
    _clear_auth_cookies(response)


@router.delete(ENDPOINTS.AUTH.ACCOUNT, status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    data: AccountPasswordConfirmRequest,
    response: Response,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    auth_service.delete_account(db, current_user, data.current_password)
    _clear_auth_cookies(response)


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
