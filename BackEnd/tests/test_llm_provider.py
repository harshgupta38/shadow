"""Tests for the pluggable LLM provider layer."""

from __future__ import annotations

import pytest

from app.llm.base import LLMMessage
from app.llm.factory import get_llm_provider
from app.llm.fake_provider import FakeLLMProvider
from app.llm.gemini_provider import GeminiProvider


def test_fake_provider_echoes_last_user_message() -> None:
    provider = FakeLLMProvider()
    out = provider.generate([LLMMessage("user", "hello world")])
    assert "hello world" in out


def test_fake_provider_canned_response() -> None:
    provider = FakeLLMProvider(canned="always this")
    assert provider.generate([LLMMessage("user", "anything")]) == "always this"


def test_factory_returns_fake_when_configured() -> None:
    # conftest sets LLM_PROVIDER=fake.
    assert isinstance(get_llm_provider(), FakeLLMProvider)


def test_gemini_provider_requires_api_key() -> None:
    with pytest.raises(RuntimeError):
        GeminiProvider(api_key="", model="gemini-2.5-flash")


def test_generate_stream_default_yields_full_text() -> None:
    provider = FakeLLMProvider(canned="chunk")
    chunks = list(provider.generate_stream([LLMMessage("user", "hi")]))
    assert chunks == ["chunk"]
