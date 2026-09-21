from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core import security
from app.db.session import get_db
from app.models.admin_user import AdminUserDBM
from app.services import auth_service

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
)


def get_current_admin(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> AdminUserDBM:
    # Bearer header, not a cookie — the frontend (Firebase Hosting) and this
    # API are on different origins, and a cookie set by the API is a
    # third-party cookie from the browser's perspective. SameSite=None
    # makes it *eligible* to be sent cross-site, but Chrome Incognito and
    # mobile Safari (ITP) block third-party cookies outright regardless of
    # SameSite, which is exactly what broke login there. A header the
    # frontend attaches itself has no such policy to run into.
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise _CREDENTIALS_EXC
    token = auth_header.removeprefix("Bearer ")

    try:
        payload = security.decode_access_token(token)
        admin_id = int(payload.get("sub", ""))
    except (security.JWTError, TypeError, ValueError):
        raise _CREDENTIALS_EXC

    admin = auth_service.get_admin_by_id(db, admin_id)
    if admin is None or not admin.is_active:
        raise _CREDENTIALS_EXC

    return admin


DbSession = Annotated[Session, Depends(get_db)]
CurrentAdmin = Annotated[AdminUserDBM, Depends(get_current_admin)]
