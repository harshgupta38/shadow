from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.active_session import ActiveSessionDBM
from app.models.user import UserDBM
from app.core import security
from app.core.exceptions import ForbiddenError
from app.services.auth_service import get_user_by_id
from app.services.session_service import update_last_seen

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
)


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> UserDBM:
    token = request.cookies.get("access_token")
    if not token:
        raise _CREDENTIALS_EXC

    try:
        payload = security.decode_access_token(token)
        user_id = int(payload.get("sub", ""))
        session_id = payload.get("sid")
    except (security.JWTError, TypeError, ValueError):
        raise _CREDENTIALS_EXC

    if session_id is None:
        raise _CREDENTIALS_EXC

    sess = db.get(ActiveSessionDBM, int(session_id))
    if sess is None or sess.user_id != user_id:
        raise _CREDENTIALS_EXC

    update_last_seen(db, sess)

    user = get_user_by_id(db, user_id)
    if user is None:
        raise _CREDENTIALS_EXC

    return user


def require_device_limit_resolved(
    current_user: UserDBM = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Router-level guard: rejects requests from over-limit sessions with 403.
    Auth and settings routers are exempt so the device-limit page can still
    list/revoke sessions and adjust the limit without getting blocked.
    """
    from app.services import session_service, settings_service
    max_devices = settings_service.get_max_concurrent_devices(db, current_user.id)
    count = session_service.get_session_count(db, current_user.id)
    if count > max_devices:
        raise ForbiddenError("Device limit exceeded — sign out of a device before continuing.")


DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[UserDBM, Depends(get_current_user)]
