from datetime import datetime

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserDBM(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # Account lockout — incremented on each failed login, reset on success.
    # lockout_until is naive UTC; None means the account is not locked.
    login_attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    lockout_until: Mapped[datetime | None] = mapped_column(nullable=True, default=None)
