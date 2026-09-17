from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func, text
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

    # Short line shown on the Profile page — distinct from any goal/habit note.
    bio: Mapped[str | None] = mapped_column(String(140), nullable=True, default=None)

    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )
    # Guards /auth/resend-verification against spamming — see auth_service.
    verification_email_sent_at: Mapped[datetime | None] = mapped_column(nullable=True, default=None)

    # False while the account is deactivated (Profile page "Danger Zone").
    # Flipped back to True the next time the user logs in successfully.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("1")
    )

    # default=func.now() (not just server_default) so a row still gets a
    # timestamp from the ORM's INSERT even on a DB where this column was
    # added via ALTER TABLE — SQLite refuses a non-constant column default
    # on ADD COLUMN, so the live schema has no DB-level default to fall back
    # on there (see db/session.ensure_user_columns).
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
    )
