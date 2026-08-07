from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from app.llm.models import ChatRequest, ChatResponse


class BaseLLMProvider(ABC):
    # Abstract contract for all LLM providers.
    # Why:
    # - Keeps LLMService provider-agnostic.
    # - Forces every provider (Ollama/OpenAI/...) to expose the same API.
    # How:
    # - `chat`: return one complete response.
    # - `stream_chat`: yield response chunks progressively.
    # - `health_check`: report provider availability.
    # - `close`: optional cleanup hook for client/resources.
    """Provider contract consumed by the rest of the application."""

    @abstractmethod
    async def chat(self, request: ChatRequest) -> ChatResponse:
        """Execute a single chat completion request."""

    @abstractmethod
    async def stream_chat(self, request: ChatRequest) -> AsyncIterator[str]:
        """Stream text chunks for chat completion requests."""

    @abstractmethod
    async def health_check(self) -> bool:
        """Return provider health status."""

    async def close(self) -> None:
        """Release provider resources when needed."""
