"""User / profile schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import ThemePreference
from app.schemas.common import ORMModel


class UserRead(ORMModel):
    id: int
    email: str
    name: str
    timezone: str
    theme_preference: ThemePreference
    onboarding_completed: bool
    created_at: datetime
    updated_at: datetime

    # Basic profile
    display_name: str | None = None
    phone: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    email_verified: bool = False

    # AI profile
    profession: str | None = None
    working_hours: str | None = None
    working_style: str | None = None
    interests: str | None = None
    learning_focus: str | None = None
    long_term_vision: str | None = None
    daily_routine: str | None = None
    current_goals: str | None = None
    ai_notes: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    theme_preference: ThemePreference | None = None

    # Basic profile
    display_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=1000)
    avatar_url: str | None = Field(default=None, max_length=512)

    # AI profile
    profession: str | None = Field(default=None, max_length=160)
    working_hours: str | None = Field(default=None, max_length=120)
    working_style: str | None = Field(default=None, max_length=2000)
    interests: str | None = Field(default=None, max_length=2000)
    learning_focus: str | None = Field(default=None, max_length=2000)
    long_term_vision: str | None = Field(default=None, max_length=2000)
    daily_routine: str | None = Field(default=None, max_length=2000)
    current_goals: str | None = Field(default=None, max_length=2000)
    ai_notes: str | None = Field(default=None, max_length=2000)
