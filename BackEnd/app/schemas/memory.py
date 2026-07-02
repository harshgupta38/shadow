"""Memory (understanding) schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

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


class MemoryEntryUpdate(BaseModel):
    """Update an existing memory entry."""

    category: MemoryCategory | None = None
    ai_understanding: str | None = Field(default=None, min_length=1)
    question: str | None = None
    answer: str | None = None


class MemoryRefineRequest(BaseModel):
    """Request body for refining user-entered memory text with AI."""

    text: str = Field(min_length=1)
    category: MemoryCategory = MemoryCategory.other


class MemoryRefineResponse(BaseModel):
    """AI-refined memory text for user review and final save."""

    refined_text: str
    status: Literal["refined", "fallback"] = "refined"
    reason: str | None = None


class MemoryCenterEntryRead(ORMModel):
    """UI-friendly memory card shape for Profile > AI Memory Center."""

    id: int
    category: MemoryCategory
    value: str
    source: MemorySource
    confidence: str
    editable: bool
    used_by: list[str]
    created_at: datetime
    updated_at: datetime
