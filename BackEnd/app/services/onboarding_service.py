"""Onboarding interview business logic."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.orchestrator import generate_onboarding_understanding
from app.llm.base import LLMProvider
from app.memory.context import compile_user_context
from app.models.enums import MemoryCategory, MemorySource
from app.models.memory import MemoryEntry
from app.models.user import User
from app.schemas.onboarding import OnboardingAnswerRequest, OnboardingQuestion
from app.services import settings_service

# Ordered interview questions covering daily → life goals + working style.
DEFAULT_QUESTIONS: list[dict] = [
    {"id": "daily_focus", "category": MemoryCategory.daily,
     "question": "What does a productive day look like for you right now?", "order": 1},
    {"id": "weekly_goal", "category": MemoryCategory.weekly,
     "question": "What would you like to accomplish in a typical week?", "order": 2},
    {"id": "monthly_goal", "category": MemoryCategory.monthly,
     "question": "What is one thing you want to achieve this month?", "order": 3},
    {"id": "career_goal", "category": MemoryCategory.career,
     "question": "Where do you want your career to be in the next 1–3 years?", "order": 4},
    {"id": "life_goal", "category": MemoryCategory.life,
     "question": "What bigger life goal matters most to you?", "order": 5},
    {"id": "working_style", "category": MemoryCategory.personality,
     "question": "When and how do you focus best, and what usually distracts you?", "order": 6},
    {"id": "motivation", "category": MemoryCategory.personality,
     "question": "What keeps you motivated when things get hard?", "order": 7},
]


def get_questions() -> list[OnboardingQuestion]:
    return [OnboardingQuestion(**q) for q in DEFAULT_QUESTIONS]


def record_answer(
    db: Session,
    user: User,
    provider: LLMProvider,
    data: OnboardingAnswerRequest,
) -> MemoryEntry:
    """Interpret an answer into a saved 'understanding' MemoryEntry."""
    context = compile_user_context(db, user)
    preferred_model = settings_service.get_effective_ai_model(db, user)
    understanding = generate_onboarding_understanding(
        provider,
        question=data.question,
        answer=data.answer,
        user_context=context,
        model=preferred_model,
    )
    entry = MemoryEntry(
        user_id=user.id,
        category=data.category,
        question=data.question,
        answer=data.answer,
        ai_understanding=understanding,
        source=MemorySource.onboarding,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def complete_onboarding(db: Session, user: User) -> User:
    user.onboarding_completed = True
    db.commit()
    db.refresh(user)
    return user
