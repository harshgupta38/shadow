"""LLM provider factory — selects the provider from settings.

To add another model (OpenAI, Claude, Ollama, …): implement a new
``LLMProvider`` subclass and add a branch here. Nothing else changes.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from app.constant import PROVIDER_FAKE, PROVIDER_GEMINI, settings
from app.llm.base import LLMProvider
from app.llm.fake_provider import FakeLLMProvider
from app.llm.gemini_provider import GeminiProvider

logger = logging.getLogger(__name__)


@lru_cache
def get_llm_provider() -> LLMProvider:
    """Return the configured provider singleton."""
    name = (settings.llm_provider or PROVIDER_GEMINI).lower()

    if name == PROVIDER_FAKE:
        return FakeLLMProvider()

    if name == PROVIDER_GEMINI:
        if not settings.gemini_api_key:
            logger.warning(
                "LLM_PROVIDER=gemini but GEMINI_API_KEY is empty; "
                "falling back to the offline fake provider. Set GEMINI_API_KEY "
                "in .env to enable real Gemini responses."
            )
            return FakeLLMProvider()
        return GeminiProvider(settings.gemini_api_key, settings.gemini_model)

    raise ValueError(f"Unknown LLM provider: {name!r}")
