"""Memory (understanding) schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import MemoryCategory, MemorySource
from app.schemas.common import ORMModel


class MemoryEntryRead(ORMModel):
    id: int
    category: MemoryCategory
    question: str | None
    answer: str | None
    ai_understanding: str
    source: MemorySource
    created_at: datetime
    updated_at: datetime


class MemoryEntryCreate(BaseModel):
    """Manually add a memory/understanding about the user."""

    category: MemoryCategory = MemoryCategory.other
    ai_understanding: str = Field(min_length=1)
    question: str | None = None
    answer: str | None = None
    source: MemorySource = MemorySource.manual
