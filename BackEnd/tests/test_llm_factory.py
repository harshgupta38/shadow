"""Tests for the LLM provider factory branches."""

from __future__ import annotations

import pytest

import app.llm.factory as factory_mod
from app.llm.fake_provider import FakeLLMProvider
from app.llm.gemini_provider import GeminiProvider


@pytest.fixture(autouse=True)
def _clear_cache():
    factory_mod.get_llm_provider.cache_clear()
    yield
    factory_mod.get_llm_provider.cache_clear()


def test_gemini_without_key_falls_back_to_fake(monkeypatch) -> None:
    monkeypatch.setattr(factory_mod.settings, "llm_provider", "gemini")
    monkeypatch.setattr(factory_mod.settings, "gemini_api_key", "")
    assert isinstance(factory_mod.get_llm_provider(), FakeLLMProvider)


def test_gemini_with_key_returns_gemini(monkeypatch) -> None:
    monkeypatch.setattr(factory_mod.settings, "llm_provider", "gemini")
    monkeypatch.setattr(factory_mod.settings, "gemini_api_key", "test-key")
    assert isinstance(factory_mod.get_llm_provider(), GeminiProvider)


def test_unknown_provider_raises(monkeypatch) -> None:
    monkeypatch.setattr(factory_mod.settings, "llm_provider", "does-not-exist")
    with pytest.raises(ValueError):
        factory_mod.get_llm_provider()
