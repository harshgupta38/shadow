from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, AuthError
from app.core import security
from app.models.user import UserDBM
from app.schemas.auth import RegisterRequest
from app.services import notifications_service


def _get_user_by_email(db: Session, email: str) -> UserDBM | None:
    return db.scalar(
        select(UserDBM).where(
            UserDBM.email == email.strip().lower(),
        )
    )


def get_user_by_id(db: Session, user_id: int) -> UserDBM | None:
    return db.get(UserDBM, user_id)


def login_user(
    db: Session,
    email: str,
    password: str,
) -> UserDBM | None:
    user = _get_user_by_email(db, email)

    if user is None:
        raise AuthError()

    if not security.verify_password(password, user.hashed_password):
        raise AuthError()

    return user


def register_user(db: Session, data: RegisterRequest) -> UserDBM:
    existing_user = _get_user_by_email(db, str(data.email))
    if existing_user is not None:
        raise ConflictError("An account with this email already exists.")

    user = UserDBM(
        name=data.name.strip(),
        email=data.email.strip().lower(),
        hashed_password=security.hash_password(data.password),
    )

    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError("An account with this email already exists.")
    db.refresh(user)
    notifications_service.create_notification(
        db, user,
        title=f"Welcome to Shadow, {user.name.split()[0]}!",
        body="Your intelligent productivity assistant is ready. Start by setting a goal.",
        type="system",
        url="/goals",
        event_key=f"welcome:{user.id}",
    )

    return user
