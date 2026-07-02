"""User account model."""

from __future__ import annotations

from sqlalchemy import Boolean, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import ThemePreference


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    theme_preference: Mapped[ThemePreference] = mapped_column(
        SAEnum(ThemePreference), default=ThemePreference.light, nullable=False
    )
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── Basic profile (identity) ────────────────────────────────────────────
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── AI profile (used to personalise assistant responses) ────────────────
    profession: Mapped[str | None] = mapped_column(String(160), nullable=True)
    working_hours: Mapped[str | None] = mapped_column(String(120), nullable=True)
    working_style: Mapped[str | None] = mapped_column(Text, nullable=True)
    interests: Mapped[str | None] = mapped_column(Text, nullable=True)
    learning_focus: Mapped[str | None] = mapped_column(Text, nullable=True)
    long_term_vision: Mapped[str | None] = mapped_column(Text, nullable=True)
    daily_routine: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_goals: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
