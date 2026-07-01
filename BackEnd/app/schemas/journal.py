"""Journal schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class JournalCreate(BaseModel):
    content: str = Field(min_length=1)
    mood: str | None = Field(default=None, max_length=32)


class JournalUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1)
    mood: str | None = Field(default=None, max_length=32)


class JournalRead(ORMModel):
    id: int
    content: str
    mood: str | None
    created_at: datetime
    updated_at: datetime
