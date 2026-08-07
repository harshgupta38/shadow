from collections.abc import AsyncIterator

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, OpenAIError, RateLimitError

from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import ChatRole, LLMProvider
from app.llm.exceptions import LLMHealthCheckError, LLMProviderError, LLMRequestError
from app.llm.models import ChatMessage, ChatRequest, ChatResponse, TokenUsage


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

    # Converts provider-agnostic ChatMessage objects into the OpenAI-compatible
    # payload format expected by Ollama API calls (role/content plus optional name).
    @staticmethod
    def _build_messages(messages: list[ChatMessage]) -> list[dict[str, str]]:
        payload: list[dict[str, str]] = []

        for message in messages:
            message_payload: dict[str, str] = {
                "role": message.role.value,
                "content": message.content,
            }
            if message.name:
                message_payload["name"] = message.name

            payload.append(message_payload)

        return payload

    def _resolve_model(self, request: ChatRequest) -> str:
        return request.model or self._settings.ollama_model

    async def chat(self, request: ChatRequest) -> ChatResponse:
        model = self._resolve_model(request)

        try:
            completion = await self._client.chat.completions.create(
                model=model,
                messages=self._build_messages(request.messages),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, RateLimitError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama chat request failed: {exc}") from exc

        if not completion.choices:
            raise LLMRequestError("Ollama returned an empty choices list.")

        first_choice = completion.choices[0]
        assistant_content = first_choice.message.content

        if not assistant_content:
            raise LLMRequestError("Ollama returned an empty assistant response.")

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return ChatResponse(
            provider=LLMProvider.OLLAMA,
            model=completion.model or model,
            message=ChatMessage(
                role=ChatRole.ASSISTANT,
                content=assistant_content,
            ),
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
        )

    async def stream_chat(self, request: ChatRequest) -> AsyncIterator[str]:
        model = self._resolve_model(request)

        try:
            stream = await self._client.chat.completions.create(
                model=model,
                messages=self._build_messages(request.messages),
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                stream=True,
            )

            async for chunk in stream:
                if not chunk.choices:
                    continue

                delta_content = chunk.choices[0].delta.content
                if delta_content:
                    yield delta_content
        except (APIConnectionError, APIStatusError, RateLimitError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama streaming request failed: {exc}") from exc

    async def health_check(self) -> bool:
        # Ollama OpenAI compatibility includes the /models endpoint used by SDK model listing.
        try:
            await self._client.models.list()
            return True
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMHealthCheckError(f"Ollama health check failed: {exc}") from exc

    async def close(self) -> None:
        await self._client.close()
