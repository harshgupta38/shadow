from functools import lru_cache
from collections.abc import AsyncIterator

from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import ChatRole, LLMProvider
from app.llm.exceptions import LLMConfigurationError
from app.llm.models import ChatMessage, ChatRequest, ChatResponse
from app.llm.providers.ollama import OllamaProvider


class LLMService:
    """Provider-agnostic application entrypoint for LLM operations."""

    def __init__(
        self,
        settings: LLMSettings | None = None,
        provider: BaseLLMProvider | None = None,
    ):
        self._settings = settings or llm_settings
        self._provider = provider or self._build_provider(self._settings)

    # Builds the concrete LLM provider from configuration.
    # Flow:
    # 1) Read configured provider from `settings.llm_provider` (loaded from .env / defaults).
    # 2) Look up the matching provider class in `provider_registry`.
    # 3) If not found, raise LLMConfigurationError (invalid/unsupported provider value).
    # 4) Instantiate and return the provider with the same settings.
    @staticmethod
    def _build_provider(settings: LLMSettings) -> BaseLLMProvider:
        provider_registry: dict[LLMProvider, type[BaseLLMProvider]] = {
            LLMProvider.OLLAMA: OllamaProvider,
        }

        provider_cls = provider_registry.get(settings.llm_provider)
        if provider_cls is None:
            raise LLMConfigurationError(
                f"Unsupported LLM provider configured: {settings.llm_provider.value}"
            )

        return provider_cls(settings=settings)

    # Adds the configured system prompt as the first message in the request.
    # Why:
    # - Ensures every call includes global assistant behavior rules from settings.
    # How:
    # - Builds a SYSTEM-role ChatMessage from `self._settings.llm_system_prompt`
    # - Returns a new ChatRequest with that system message prepended
    # - Preserves the original model, temperature, and max_tokens values
    def _with_system_prompt(self, request: ChatRequest) -> ChatRequest:
        system_message = ChatMessage(
            role=ChatRole.SYSTEM,
            content=self._settings.llm_system_prompt,
        )

        return ChatRequest(
            messages=[system_message, *request.messages],
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

    async def chat(self, request: ChatRequest) -> ChatResponse:
        normalized_request = self._with_system_prompt(request)
        return await self._provider.chat(normalized_request)

    # Streams the model response chunk-by-chunk instead of waiting for one full reply.
    # Flow:
    # 1) Normalize request by prepending the system prompt.
    # 2) Call provider streaming API with the normalized request.
    # 3) Re-yield each incoming text chunk to the caller immediately.
    # In normal words, it send response in chunks, just like we see in chatgpt sites
    async def stream_chat(self, request: ChatRequest) -> AsyncIterator[str]:
        normalized_request = self._with_system_prompt(request)
        async for chunk in self._provider.stream_chat(normalized_request):
            yield chunk

    async def health_check(self) -> bool:
        return await self._provider.health_check()

    async def close(self) -> None:
        await self._provider.close()


@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    """Dependency provider for FastAPI injection."""

    return LLMService()
