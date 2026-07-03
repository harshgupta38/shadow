"""Deterministic fake LLM provider for offline dev and hermetic tests.

Never calls the network. Selected via ``LLM_PROVIDER=fake`` or used as an
automatic fallback when ``LLM_PROVIDER=gemini`` but no API key is set.
"""

from __future__ import annotations

from collections.abc import Iterator

from app.llm.base import LLMMessage, LLMProvider


class FakeLLMProvider(LLMProvider):
    """Returns canned or echoed text so agents work without a real model."""

    def __init__(self, canned: str | None = None) -> None:
        self._canned = canned

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        if self._canned is not None:
            return self._canned
        last_user = next(
            (m.content for m in reversed(messages) if m.role == "user"),
            messages[-1].content if messages else "",
        )
        return f"[fake-llm] {last_user.strip()[:280]}"

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        yield self.generate(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            model=model,
        )
