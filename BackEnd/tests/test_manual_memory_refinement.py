"""Manual memory refinement pipeline tests."""

from __future__ import annotations

from app.database import SessionLocal
from app.llm.base import LLMProvider
from app.models.enums import MemoryCategory
from app.schemas.auth import RegisterRequest
from app.schemas.memory import MemoryRefineRequest
from app.services import auth_service, memory_service


def _make_user(db):
    return auth_service.register_user(
        db,
        RegisterRequest(email="manual-memory@example.com", password="password123", name="Memory User"),
    )


class RetryThenPassProvider(LLMProvider):
    """First draft fails validation, second draft passes."""

    def __init__(self) -> None:
        self.refine_calls = 0
        self.validate_calls = 0

    def generate(self, messages, *, system=None, temperature=0.7, max_tokens=None) -> str:
        if system and "Memory Fidelity Validator" in system:
            self.validate_calls += 1
            if self.validate_calls == 1:
                return "FAIL: candidate weakens long-term goal detail"
            return "PASS"

        self.refine_calls += 1
        if self.refine_calls == 1:
            return (
                "The user solves 10 LeetCode problems every day to improve DSA consistency. "
                "They are working on interview preparation."
            )

        return (
            "The user is committed to solving 10 LeetCode problems every day because they want "
            "to become a Google software engineer, and consistency keeps them motivated."
        )


class AlwaysWeakProvider(LLMProvider):
    """Always returns a vague memory that fails measurable-fact validation."""

    def generate(self, messages, *, system=None, temperature=0.7, max_tokens=None) -> str:
        if system and "Memory Fidelity Validator" in system:
            return "FAIL"
        return "The user practices LeetCode regularly and wants career growth."


def test_refine_retries_and_returns_valid_memory() -> None:
    raw_text = (
        "I solve 10 LeetCode problems every day because I want to become a Google software engineer "
        "and consistency keeps me motivated."
    )

    with SessionLocal() as db:
        user = _make_user(db)
        provider = RetryThenPassProvider()

        result = memory_service.refine_memory_text(
            db,
            user,
            provider,
            MemoryRefineRequest(category=MemoryCategory.career, text=raw_text),
        )

    refined = result.refined_text

    assert "10 LeetCode problems every day" in refined
    assert "Google software engineer" in refined
    assert result.status == "refined"
    assert result.reason is None
    assert provider.refine_calls == 2
    assert provider.validate_calls == 2


def test_refine_falls_back_to_raw_when_all_attempts_fail() -> None:
    raw_text = "I solve 10 LeetCode problems every day."

    with SessionLocal() as db:
        user = _make_user(db)
        provider = AlwaysWeakProvider()

        result = memory_service.refine_memory_text(
            db,
            user,
            provider,
            MemoryRefineRequest(category=MemoryCategory.career, text=raw_text),
        )

    assert result.refined_text == raw_text
    assert result.status == "fallback"
    assert result.reason