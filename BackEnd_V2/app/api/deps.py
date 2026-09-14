from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.active_session import ActiveSessionDBM
from app.models.user import UserDBM
from app.core import security
from app.services.auth_service import get_user_by_id
from app.services.session_service import update_last_seen

_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> UserDBM:
    if credentials is None or not credentials.credentials:
        raise _CREDENTIALS_EXC

    token = credentials.credentials

    try:
        payload = security.decode_access_token(token)
        user_id = int(payload.get("sub", ""))
        session_id = payload.get("sid")
    except (security.JWTError, TypeError, ValueError):
        raise _CREDENTIALS_EXC

    if session_id is None:
        # Token predates session tracking — force re-login
        raise _CREDENTIALS_EXC

    sess = db.get(ActiveSessionDBM, int(session_id))
    if sess is None or sess.user_id != user_id:
        raise _CREDENTIALS_EXC

    update_last_seen(db, sess)

    user = get_user_by_id(db, user_id)
    if user is None:
        raise _CREDENTIALS_EXC

    return user


DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[UserDBM, Depends(get_current_user)]
