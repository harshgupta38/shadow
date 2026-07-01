"""Onboarding interview schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.enums import MemoryCategory
from app.schemas.memory import MemoryEntryRead


class OnboardingQuestion(BaseModel):
    id: str
    category: MemoryCategory
    question: str
    order: int


class OnboardingAnswerRequest(BaseModel):
    question_id: str = Field(min_length=1)
    question: str = Field(min_length=1)
    category: MemoryCategory = MemoryCategory.other
    answer: str = Field(min_length=1)


class OnboardingAnswerResponse(BaseModel):
    understanding: str
    memory: MemoryEntryRead
