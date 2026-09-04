"""Extended user identity profile used by AI and cross-module personalization."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class UserProfile(Base, TimestampMixin):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    # Basic profile
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    profile_picture_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    current_role: Mapped[str | None] = mapped_column(String(160), nullable=True)
    current_goal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    short_bio: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI profile domains
    profession: Mapped[str | None] = mapped_column(String(160), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    experience_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_tech_stack: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    dream_company: Mapped[str | None] = mapped_column(String(160), nullable=True)
    interview_preparation_status: Mapped[str | None] = mapped_column(String(160), nullable=True)

    long_term_vision: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_goals_overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    daily_routine: Mapped[str | None] = mapped_column(Text, nullable=True)
    working_style: Mapped[str | None] = mapped_column(Text, nullable=True)
    learning_profile: Mapped[str | None] = mapped_column(Text, nullable=True)
    productivity_preferences: Mapped[str | None] = mapped_column(Text, nullable=True)
    motivation: Mapped[str | None] = mapped_column(Text, nullable=True)
    always_remember: Mapped[str | None] = mapped_column(Text, nullable=True)

    profile_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
