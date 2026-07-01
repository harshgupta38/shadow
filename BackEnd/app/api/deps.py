"""Shared FastAPI dependencies (DB session, current user, LLM provider)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.llm.base import LLMProvider
from app.llm.factory import get_llm_provider
from app.models.user import User
from app.services import security
from app.services.auth_service import get_user_by_id

_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Resolve the authenticated user from a Bearer JWT."""
    if credentials is None or not credentials.credentials:
        raise _CREDENTIALS_EXC
    try:
        payload = security.decode_token(credentials.credentials)
        user_id = int(payload.get("sub", ""))
    except (security.JWTError, TypeError, ValueError):
        raise _CREDENTIALS_EXC

    user = get_user_by_id(db, user_id)
    if user is None:
        raise _CREDENTIALS_EXC
    return user


def get_provider() -> LLMProvider:
    """Return the configured LLM provider (overridable in tests)."""
    return get_llm_provider()


# Reusable annotated dependencies for tidy router signatures.
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
Provider = Annotated[LLMProvider, Depends(get_provider)]
