from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, AuthError
from app.core import security
from app.models.user import User
from app.schemas.auth import RegisterRequest


def _get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(
        select(User).where(
            User.email == email.strip().lower(),
        )
    )


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def login_user(
    db: Session,
    email: str,
    password: str,
) -> User | None:
    user = _get_user_by_email(db, email)

    if user is None:
        raise AuthError("Invalid email or password.")

    if not security.verify_password(password, user.hashed_password):
        raise Exception("Invalid email or password.")

    return user


def register_user(db: Session, data: RegisterRequest) -> User:
    existing_user = _get_user_by_email(db, str(data.email))
    if existing_user is not None:
        raise ConflictError("An account with this email already exists.")

    user = User(
        name=data.name.strip(),
        email=data.email.strip().lower(),
        hashed_password=security.hash_password(data.password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user
