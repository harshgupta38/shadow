"""Security helpers — password hashing (bcrypt) and JWT (python-jose)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.constant import settings

# bcrypt truncates at 72 bytes; that is acceptable for our use.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of ``password``."""
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Verify ``password`` against a stored bcrypt ``hashed`` value."""
    try:
        return pwd_context.verify(password, hashed)
    except ValueError:
        return False


def create_access_token(subject: str | int, expires_minutes: int | None = None) -> str:
    """Create a signed JWT whose ``sub`` claim is ``subject``."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(
        minutes=expires_minutes
        if expires_minutes is not None
        else settings.access_token_expire_minutes
    )
    payload = {"sub": str(subject), "iat": now, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Decode/verify a JWT. Raises ``jose.JWTError`` if invalid/expired."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


__all__ = [
    "hash_password",
    "verify_password",
    "create_access_token",
    "decode_token",
    "JWTError",
]
