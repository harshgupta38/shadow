from time import perf_counter

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, OpenAIError
from app.schemas.chat import (
    ConversationContextFromLLMSchema,
    MessageFromLLMSchema,
    NewConvoFromLLMSchema,
)
from app.analysis.llm_usage_logger import log_ollama_completion_usage_async
from app.llm.enums import LLMProvider, Role
from app.llm.knowledge_base import (
    CONVERSATION_CONTEXT_SYSTEM_INSTRUCTION,
    GOAL_REFINEMENT_SYSTEM_INSTRUCTION,
    RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION,
    build_goal_refinement_user_prompt,
    CREATE_CONVERSATION_SYSTEM_INSTRUCTION,
)
from app.schemas.goals import RefineGoalFromLLMSchema
from app.llm.models import (
    MessageToLLM,
    MessageFromLLM,
    TokenUsage,
    RefineGoalToLLM,
    RefineGoalFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    ConversationContextToLLM,
    ConversationContextFromLLM,
)
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.exceptions import (
    LLMHealthCheckError,
    LLMProviderError,
    LLMRequestError,
)


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

    def _resolve_model(self, request: RefineGoalToLLM) -> str:
        model = request.model or self._settings.ollama_model

        if not model:
            raise LLMRequestError("Ollama model is not configured.")

        return model

    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        model = self._resolve_model(request)

        request_data = request.request_data
        messages = [
            {
                "role": Role.SYSTEM,
                "content": GOAL_REFINEMENT_SYSTEM_INSTRUCTION,
            },
            {
                "role": Role.USER,
                "content": build_goal_refinement_user_prompt(request_data),
            },
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=RefineGoalFromLLMSchema,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama refine_goal failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="refine_goal",
        )

        if not completion.choices:
            raise LLMRequestError("Ollama returned no choices for refine_goal.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused refine_goal response: {message.refusal}"
                )
            raise LLMRequestError("Ollama returned an unparsable refine_goal response.")

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return RefineGoalFromLLM(
            refined_data=parsed,
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
        )

    async def create_conversation(self, request: NewConvoToLLM) -> NewConvoFromLLM:
        model = self._resolve_model(request)

        request_data = request.request_data
        messages = [
            {
                "role": Role.SYSTEM,
                "content": CREATE_CONVERSATION_SYSTEM_INSTRUCTION[
                    request_data.agent_type
                ],
            },
            {
                "role": Role.USER, 
                "content": request_data.content
            },
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=NewConvoFromLLMSchema,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama create_conversation failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="create_conversation",
        )

        if not completion.choices:
            raise LLMRequestError("Ollama returned no choices for create_conversation.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused create_conversation response: {message.refusal}"
                )
            raise LLMRequestError(
                "Ollama returned an unparsable create_conversation response."
            )

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return NewConvoFromLLM(
            llm_data=parsed,
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
        )

    async def respond_to_message(self, request: MessageToLLM) -> MessageFromLLM:
        model = self._resolve_model(request)

        conversation_context = (
            f"Stable context:\n{request.stable_context}\n\n"
            f"Conversation summary:\n{request.context_summary}"
        )
        messages = [
            {
                "role": Role.SYSTEM,
                "content": RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION[
                    request.agent_type
                ],
            },
            {
                "role": Role.SYSTEM,
                "content": conversation_context,
            },
            *request.recent_messages,
            {
                "role": Role.USER,
                "content": request.request_data,
            },
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=MessageFromLLMSchema,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama respond_to_message failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="respond_to_message",
        )

        if not completion.choices:
            raise LLMRequestError("Ollama returned no choices for respond_to_message.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused respond_to_message response: {message.refusal}"
                )
            raise LLMRequestError(
                "Ollama returned an unparsable respond_to_message response."
            )

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return MessageFromLLM(
            llm_data=parsed,
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
        )

    async def update_conversation_context(
        self, request: ConversationContextToLLM
    ) -> ConversationContextFromLLM:
        model = self._resolve_model(request)
        existing_context = (
            f"Stable context:\n{request.stable_context}\n\n"
            f"Conversation summary:\n{request.context_summary}"
        )
        messages = [
            {"role": Role.SYSTEM, "content": CONVERSATION_CONTEXT_SYSTEM_INSTRUCTION},
            {"role": Role.SYSTEM, "content": existing_context},
            *request.messages,
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=ConversationContextFromLLMSchema,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(
                f"Ollama update_conversation_context failed: {exc}"
            ) from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="update_conversation_context",
        )

        if not completion.choices:
            raise LLMRequestError(
                "Ollama returned no choices for update_conversation_context."
            )

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed
        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    "Ollama refused update_conversation_context response: "
                    f"{message.refusal}"
                )
            raise LLMRequestError(
                "Ollama returned an unparsable update_conversation_context response."
            )

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return ConversationContextFromLLM(
            llm_data=parsed,
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
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
