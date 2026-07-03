"""LLM provider abstraction (pluggable).

Feature/agent code depends **only** on :class:`LLMProvider`. Swapping
Gemini for another model later means adding a new provider class and a
factory branch — no feature code changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass


@dataclass
class LLMMessage:
    """A single conversation turn passed to a provider.

    ``role`` is one of ``"system"``, ``"user"`` or ``"assistant"``.
    """

    role: str
    content: str


class LLMProvider(ABC):
    """Interface every concrete LLM provider must implement."""

    @abstractmethod
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        """Return a single completion for ``messages``.

        ``system`` is an optional system/persona instruction injected
        ahead of the conversation.
        """
        raise NotImplementedError

    def generate_stream(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> Iterator[str]:
        """Yield the completion in chunks.

        The default implementation yields the full :meth:`generate` result
        once; providers that support streaming may override it.
        """
        yield self.generate(
            messages,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
            model=model,
        )
