from time import perf_counter

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, OpenAIError
from app.analysis.llm_usage_logger import log_openai_completion_usage_async
from app.llm.cost import calculate_token_cost
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import LLMProvider, Role
from app.llm.exceptions import (
    LLMHealthCheckError,
    LLMProviderError,
    LLMRequestError,
)
from app.llm.knowledge_base import (
    CONVERSATION_CONTEXT_SYSTEM_INSTRUCTION,
    GOAL_REFINEMENT_SYSTEM_INSTRUCTION,
    RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION,
    CREATE_CONVERSATION_SYSTEM_INSTRUCTION,
    build_goal_refinement_user_prompt,
)
from app.llm.models import (
    ConversationContextToLLM,
    ConversationContextFromLLM,
    MessageToLLM,
    MessageFromLLM,
    RefineGoalToLLM,
    RefineGoalFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    TokenUsage,
)
from app.schemas.goals import RefineGoalFromLLMSchema
from app.schemas.chat import (
    ConversationContextFromLLMSchema,
    MessageFromLLMSchema,
    NewConvoFromLLMSchema,
)


class OpenAIProvider(BaseLLMProvider):

    def __init__(self, settings: LLMSettings | None = None):
        self._settings = settings or llm_settings

        self._client = AsyncOpenAI(
            api_key=self._settings.openai_api_key,
            timeout=self._settings.llm_request_timeout_seconds,
        )

    def _resolve_model(self, request: RefineGoalToLLM) -> str:
        model = request.model or self._settings.openai_model

        if not model:
            raise LLMRequestError("OpenAI model is not configured.")

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
            kwargs = {
                "model": model,
                "messages": messages,
                "response_format": RefineGoalFromLLMSchema,
            }

            if request.temperature is not None:
                kwargs["temperature"] = request.temperature

            if request.max_tokens is not None:
                kwargs["max_completion_tokens"] = request.max_tokens

            completion = await self._client.beta.chat.completions.parse(**kwargs)

        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"OpenAI refine_goal failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_openai_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="refine_goal",
        )

        if not completion.choices:
            raise LLMRequestError("OpenAI returned no choices for refine_goal.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"OpenAI refused refine_goal response: {message.refusal}"
                )
            raise LLMRequestError("OpenAI returned an unparsable refine_goal response.")

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return RefineGoalFromLLM(
            provider=LLMProvider.OPENAI,
            model=model,
            model_str=completion.model or model,
            refined_data=parsed,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=completion.usage.prompt_tokens if completion.usage else 0,
                output_tokens=(
                    completion.usage.completion_tokens if completion.usage else 0
                ),
            ),
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
            kwargs = {
                "model": model,
                "messages": messages,
                "response_format": NewConvoFromLLMSchema,
            }

            if request.temperature is not None:
                kwargs["temperature"] = request.temperature

            if request.max_tokens is not None:
                kwargs["max_completion_tokens"] = request.max_tokens

            completion = await self._client.beta.chat.completions.parse(**kwargs)
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"OpenAI create_conversation failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_openai_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="create_conversation",
        )

        if not completion.choices:
            raise LLMRequestError("OpenAI returned no choices for create_conversation.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"OpenAI refused create_conversation response: {message.refusal}"
                )
            raise LLMRequestError("OpenAI returned an unparsable create_conversation response.")

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return NewConvoFromLLM(
            llm_data=parsed,
            provider=LLMProvider.OPENAI,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=completion.usage.prompt_tokens if completion.usage else 0,
                output_tokens=(
                    completion.usage.completion_tokens if completion.usage else 0
                ),
            ),
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
                "content": RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION[request.agent_type],
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
            kwargs = {
                "model": model,
                "messages": messages,
                "response_format": MessageFromLLMSchema,
            }

            if request.temperature is not None:
                kwargs["temperature"] = request.temperature

            if request.max_tokens is not None:
                kwargs["max_completion_tokens"] = request.max_tokens

            completion = await self._client.beta.chat.completions.parse(**kwargs)
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"OpenAI respond_to_message failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_openai_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="respond_to_message",
        )

        if not completion.choices:
            raise LLMRequestError("OpenAI returned no choices for respond_to_message.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"OpenAI refused respond_to_message response: {message.refusal}"
                )
            raise LLMRequestError(
                "OpenAI returned an unparsable respond_to_message response."
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
            provider=LLMProvider.OPENAI,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=completion.usage.prompt_tokens if completion.usage else 0,
                output_tokens=(
                    completion.usage.completion_tokens if completion.usage else 0
                ),
            ),
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
            {
                "role": Role.SYSTEM,
                "content": CONVERSATION_CONTEXT_SYSTEM_INSTRUCTION,
            },
            {
                "role": Role.SYSTEM,
                "content": existing_context,
            },
            *request.messages,
        ]

        started_at = perf_counter()
        try:
            kwargs = {
                "model": model,
                "messages": messages,
                "response_format": ConversationContextFromLLMSchema,
            }

            if request.temperature is not None:
                kwargs["temperature"] = request.temperature

            if request.max_tokens is not None:
                kwargs["max_completion_tokens"] = request.max_tokens

            completion = await self._client.beta.chat.completions.parse(**kwargs)
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(
                f"OpenAI update_conversation_context failed: {exc}"
            ) from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_openai_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="update_conversation_context",
        )

        if not completion.choices:
            raise LLMRequestError(
                "OpenAI returned no choices for update_conversation_context."
            )

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"OpenAI refused update_conversation_context response: {message.refusal}"
                )
            raise LLMRequestError(
                "OpenAI returned an unparsable update_conversation_context response."
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
            provider=LLMProvider.OPENAI,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=completion.usage.prompt_tokens if completion.usage else 0,
                output_tokens=(
                    completion.usage.completion_tokens if completion.usage else 0
                ),
            ),
        )

    async def health_check(self) -> bool:
        # OpenAI health check using the /models endpoint.
        try:
            await self._client.models.list()
            return True
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMHealthCheckError(f"OpenAI health check failed: {exc}") from exc

    async def close(self) -> None:
        await self._client.close()
