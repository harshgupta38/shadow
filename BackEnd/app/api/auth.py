"""Auth routes — register, login, current user."""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    ChangePasswordRequest,
    EmailVerificationDispatch,
    LoginRequest,
    RegisterRequest,
    Token,
)
from app.schemas.common import Message
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


@router.post("/change-password", response_model=Message)
def change_password(
    data: ChangePasswordRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> Message:
    auth_service.change_password(
        db,
        current_user,
        current_password=data.current_password,
        new_password=data.new_password,
    )
    return Message(detail="Password updated successfully")


@router.post("/request-email-verification", response_model=EmailVerificationDispatch)
def request_email_verification(
    db: DbSession,
    current_user: CurrentUser,
) -> EmailVerificationDispatch:
    return auth_service.request_email_verification(db, current_user)


@router.get("/verify-email", response_model=Message)
def verify_email(
    db: DbSession,
    token: str = Query(min_length=12, max_length=512),
) -> Message:
    auth_service.verify_email_by_token(db, token)
    return Message(detail="Email verified successfully")
