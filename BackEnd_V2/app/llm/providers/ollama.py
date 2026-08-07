
from openai import APIConnectionError, APIStatusError, AsyncOpenAI, OpenAIError

from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.exceptions import LLMHealthCheckError


class OllamaProvider(BaseLLMProvider):
    """Ollama provider through the OpenAI-compatible API."""

    # Initializes the Ollama provider with shared LLM settings and creates
    # an AsyncOpenAI client pointed at Ollama's OpenAI-compatible endpoint.
    # It uses configured base URL, API key, and request timeout so all
    # subsequent chat/stream/health calls reuse the same client connection setup.
    def __init__(self, settings: LLMSettings | None = None):
        self._settings = settings or llm_settings

        self._client = AsyncOpenAI(
            base_url=str(self._settings.ollama_base_url),
            api_key=self._settings.ollama_api_key,
            timeout=self._settings.llm_request_timeout_seconds,
        )

    async def health_check(self) -> bool:
        # Ollama OpenAI compatibility includes the /models endpoint used by SDK model listing.
        try:
            await self._client.models.list()
            return True
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMHealthCheckError(f"Ollama health check failed: {exc}") from exc

    async def close(self) -> None:
        await self._client.close()