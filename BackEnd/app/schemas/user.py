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


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    theme_preference: ThemePreference | None = None
