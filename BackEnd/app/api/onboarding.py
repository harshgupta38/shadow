"""Onboarding routes — interview questions, answers, completion."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, Provider
from app.schemas.memory import MemoryEntryRead
from app.schemas.onboarding import (
    OnboardingAnswerRequest,
    OnboardingAnswerResponse,
    OnboardingQuestion,
)
from app.schemas.user import UserRead
from app.services import onboarding_service

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.get("/questions", response_model=list[OnboardingQuestion])
def get_questions() -> list[OnboardingQuestion]:
    return onboarding_service.get_questions()


@router.post("/answer", response_model=OnboardingAnswerResponse)
def submit_answer(
    data: OnboardingAnswerRequest,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> OnboardingAnswerResponse:
    entry = onboarding_service.record_answer(db, current_user, provider, data)
    return OnboardingAnswerResponse(
        understanding=entry.ai_understanding,
        memory=MemoryEntryRead.model_validate(entry),
    )


@router.post("/complete", response_model=UserRead)
def complete(db: DbSession, current_user: CurrentUser) -> UserRead:
    return onboarding_service.complete_onboarding(db, current_user)
