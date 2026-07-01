"""Tests for memory context compilation and behavior distillation."""

from __future__ import annotations

from app.database import SessionLocal
from app.llm.fake_provider import FakeLLMProvider
from app.memory.behavior import distill_and_store_behavior
from app.memory.context import compile_user_context
from app.models.enums import MemorySource
from app.schemas.activity import ActivityLogCreate
from app.schemas.auth import RegisterRequest
from app.services import auth_service, metric_service


def _make_user(db):
    return auth_service.register_user(
        db,
        RegisterRequest(email="mem@example.com", password="password123", name="Mem"),
    )


def test_compile_context_includes_profile() -> None:
    with SessionLocal() as db:
        user = _make_user(db)
        context = compile_user_context(db, user)
        assert "Mem" in context
        assert "Profile" in context


def test_distill_stores_behavior_entry() -> None:
    with SessionLocal() as db:
        user = _make_user(db)
        metric = metric_service.list_metrics(db, user)[0]
        metric_service.add_log(db, user, metric.id, ActivityLogCreate(value=120))

        provider = FakeLLMProvider(canned="The user is most productive in the mornings.")
        entry = distill_and_store_behavior(db, user, provider)

        assert entry is not None
        assert entry.source == MemorySource.behavior
        assert "morning" in entry.ai_understanding.lower()


def test_distill_returns_none_when_no_signal() -> None:
    with SessionLocal() as db:
        user = _make_user(db)
        provider = FakeLLMProvider(canned="NONE")
        assert distill_and_store_behavior(db, user, provider) is None
