from time import perf_counter

from google import genai
from google.genai import types, errors

from app.analysis.llm_usage_logger import log_gemini_completion_usage_async
from app.llm.cost import calculate_token_cost
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import LLMProvider
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
    MetadataToLLM,
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


class GeminiProvider(BaseLLMProvider):

    def __init__(self, settings: LLMSettings | None = None):
        self._settings = settings or llm_settings
        self._client = genai.Client(api_key=self._settings.gemini_api_key)

    def _resolve_model(self, request: MetadataToLLM) -> str:
        model = request.model or self._settings.gemini_model

        if not model:
            raise LLMRequestError("Gemini model is not configured.")

        return model

    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        model = self._resolve_model(request)

        request_data = request.request_data

        started_at = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=build_goal_refinement_user_prompt(request_data),
                config=types.GenerateContentConfig(
                    system_instruction=GOAL_REFINEMENT_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=RefineGoalFromLLMSchema,
                    temperature=request.temperature,
                    max_output_tokens=request.max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds
                        * 1000,  # HttpOptions takes milliseconds
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(f"Gemini refine_goal failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=response,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="refine_goal",
        )

        if not response.candidates:
            raise LLMRequestError("Gemini returned no choices for refine_goal.")

        first_choice = response.candidates[0]
        parsed = response.parsed

        if parsed is None:
            raise LLMRequestError("Gemini returned an unparsable refine_goal response.")

        usage = None
        if response.usage_metadata is not None:
            usage = TokenUsage(
                input_tokens=response.usage_metadata.prompt_token_count,
                output_tokens=(response.usage_metadata.candidates_token_count or 0)
                + (response.usage_metadata.thoughts_token_count or 0),
                total_tokens=response.usage_metadata.total_token_count,
            )

        return RefineGoalFromLLM(
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=response.model_version or model,
            refined_data=parsed,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=response.response_id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=usage.input_tokens if usage and usage.input_tokens else 0,
                output_tokens=(
                    usage.output_tokens if usage and usage.output_tokens else 0
                ),
            ),
        )

    async def create_conversation(self, request: NewConvoToLLM) -> NewConvoFromLLM:
        model = self._resolve_model(request)

        request_data = request.request_data

        started_at = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=request_data.content,
                config=types.GenerateContentConfig(
                    system_instruction=CREATE_CONVERSATION_SYSTEM_INSTRUCTION[
                        request_data.agent_type
                    ],
                    response_mime_type="application/json",
                    response_schema=NewConvoFromLLMSchema,
                    temperature=request.temperature,
                    max_output_tokens=request.max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds
                        * 1000,  # HttpOptions takes milliseconds
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(f"Gemini create_conversation failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=response,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="create_conversation",
        )

        if not response.candidates:
            raise LLMRequestError("Gemini returned no choices for create_conversation.")

        first_choice = response.candidates[0]
        parsed = response.parsed

        if parsed is None:
            raise LLMRequestError("Gemini returned an unparsable create_conversation response.")

        usage = None
        if response.usage_metadata is not None:
            usage = TokenUsage(
                input_tokens=response.usage_metadata.prompt_token_count,
                output_tokens=(response.usage_metadata.candidates_token_count or 0)
                + (response.usage_metadata.thoughts_token_count or 0),
                total_tokens=response.usage_metadata.total_token_count,
            )

        return NewConvoFromLLM(
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=response.model_version or model,
            llm_data=parsed,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=response.response_id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=usage.input_tokens if usage and usage.input_tokens else 0,
                output_tokens=(
                    usage.output_tokens if usage and usage.output_tokens else 0
                ),
            ),
        )

    async def respond_to_message(self, request: MessageToLLM) -> MessageFromLLM:
        model = self._resolve_model(request)

        system_instruction = (
            RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION[request.agent_type]
            + f"\n\nStable context:\n{request.stable_context}\n\n"
            + f"Conversation summary:\n{request.context_summary}"
        )
        contents = [
            types.Content(
                role="model" if msg["role"] == "assistant" else msg["role"],
                parts=[types.Part(text=msg["content"])],
            )
            for msg in request.recent_messages
        ]
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part(text=request.request_data)],
            )
        )

        started_at = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=MessageFromLLMSchema,
                    temperature=request.temperature,
                    max_output_tokens=request.max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds
                        * 1000,  # HttpOptions takes milliseconds
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(f"Gemini respond_to_message failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=response,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="respond_to_message",
        )

        if not response.candidates:
            raise LLMRequestError("Gemini returned no choices for respond_to_message.")

        first_choice = response.candidates[0]
        parsed = response.parsed

        if parsed is None:
            raise LLMRequestError(
                "Gemini returned an unparsable respond_to_message response."
            )

        usage = None
        if response.usage_metadata is not None:
            usage = TokenUsage(
                input_tokens=response.usage_metadata.prompt_token_count,
                output_tokens=(response.usage_metadata.candidates_token_count or 0)
                + (response.usage_metadata.thoughts_token_count or 0),
                total_tokens=response.usage_metadata.total_token_count,
            )

        return MessageFromLLM(
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=response.model_version or model,
            llm_data=parsed,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=response.response_id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=usage.input_tokens if usage and usage.input_tokens else 0,
                output_tokens=(
                    usage.output_tokens if usage and usage.output_tokens else 0
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
        system_instruction = (
            CONVERSATION_CONTEXT_SYSTEM_INSTRUCTION + f"\n\n{existing_context}"
        )
        contents = [
            types.Content(
                role="model" if msg["role"] == "assistant" else msg["role"],
                parts=[types.Part(text=msg["content"])],
            )
            for msg in request.messages
        ]

        started_at = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=ConversationContextFromLLMSchema,
                    temperature=request.temperature,
                    max_output_tokens=request.max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds
                        * 1000,  # HttpOptions takes milliseconds
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(
                f"Gemini update_conversation_context failed: {exc}"
            ) from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=response,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="update_conversation_context",
        )

        if not response.candidates:
            raise LLMRequestError(
                "Gemini returned no choices for update_conversation_context."
            )

        first_choice = response.candidates[0]
        parsed = response.parsed

        if parsed is None:
            raise LLMRequestError(
                "Gemini returned an unparsable update_conversation_context response."
            )

        usage = None
        if response.usage_metadata is not None:
            usage = TokenUsage(
                input_tokens=response.usage_metadata.prompt_token_count,
                output_tokens=(response.usage_metadata.candidates_token_count or 0)
                + (response.usage_metadata.thoughts_token_count or 0),
                total_tokens=response.usage_metadata.total_token_count,
            )

        return ConversationContextFromLLM(
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=response.model_version or model,
            llm_data=parsed,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=response.response_id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=usage.input_tokens if usage and usage.input_tokens else 0,
                output_tokens=(
                    usage.output_tokens if usage and usage.output_tokens else 0
                ),
            ),
        )

    async def health_check(self) -> bool:
        # Gemini health check using the /models endpoint.
        try:
            await self._client.aio.models.list()
            return True
        except errors.APIError as exc:
            raise LLMHealthCheckError(f"Gemini health check failed: {exc}") from exc

    async def close(self) -> None:
        self._client.close()
