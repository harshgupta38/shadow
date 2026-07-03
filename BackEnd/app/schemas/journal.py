"""Journal schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.enums import JournalMood
from app.schemas.common import ORMModel


class JournalCreate(BaseModel):
    content: str = Field(min_length=1)
    mood: JournalMood | None = None


class JournalUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1)
    mood: JournalMood | None = None


class JournalRead(ORMModel):
    id: int
    content: str
    mood: JournalMood | None
    goal_alignment: str | None
    shadow_response: str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("mood", mode="before")
    @classmethod
    def normalize_mood(cls, value: Any) -> JournalMood | None:
        if value is None or isinstance(value, JournalMood):
            return value
        if isinstance(value, str):
            normalized = value.strip().capitalize()
            try:
                return JournalMood(normalized)
            except ValueError:
                return None
        return None
