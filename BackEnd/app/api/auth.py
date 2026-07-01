"""Auth routes — register, login, current user."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, RegisterRequest, Token
from app.schemas.user import UserRead
from app.services import auth_service, security

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: DbSession) -> UserRead:
    user = auth_service.register_user(db, data)
    return user


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: DbSession) -> Token:
    user = auth_service.authenticate_user(db, str(data.email), data.password)
    return Token(access_token=security.create_access_token(user.id))


@router.get("/me", response_model=UserRead)
def me(current_user: CurrentUser) -> UserRead:
    return current_user
