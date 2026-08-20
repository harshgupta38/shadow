import asyncio
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
    MILESTONE_PROPOSAL_SYSTEM_INSTRUCTION,
    RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION,
    CREATE_CONVERSATION_SYSTEM_INSTRUCTION,
    build_goal_refinement_user_prompt,
    build_milestone_proposal_user_prompt,
)
from app.llm.models import (
    ConversationContextToLLM,
    ConversationContextFromLLM,
    MessageToLLM,
    MessageFromLLM,
    MetadataToLLM,
    RefineGoalToLLM,
    RefineGoalFromLLM,
    MilestoneProposalsToLLM,
    MilestoneProposalsFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    TokenUsage,
)
from app.schemas.goals import RefineGoalFromLLMSchema
from app.schemas.milestones import MilestoneProposalListLLMSchema
from app.schemas.chat import (
    ConversationContextFromLLMSchema,
    MessageFromLLMSchema,
    NewConvoFromLLMSchema,
)
from app.llm.tools import MAX_TOOL_ITERATIONS, TOOL_DEFINITIONS


def _strip_schema_extras(obj):
    """Recursively remove keys Gemini doesn't support in JSON Schema function parameters."""
    if isinstance(obj, dict):
        return {
            k: _strip_schema_extras(v)
            for k, v in obj.items()
            if k not in ("additionalProperties", "strict")
        }
    if isinstance(obj, list):
        return [_strip_schema_extras(i) for i in obj]
    return obj


def _build_gemini_tools() -> list[types.Tool]:
    declarations = []
    for tool_def in TOOL_DEFINITIONS:
        fn = tool_def["function"]
        declarations.append(
            types.FunctionDeclaration(
                name=fn["name"],
                description=fn["description"],
                parameters_json_schema=_strip_schema_extras(fn["parameters"]),
            )
        )
    return [types.Tool(function_declarations=declarations)]


GEMINI_TOOLS = _build_gemini_tools()


class GeminiProvider(BaseLLMProvider):

    def __init__(self, settings: LLMSettings | None = None):
        self._settings = settings or llm_settings
        self._client = genai.Client(api_key=self._settings.gemini_api_key)

    def _resolve_model(self, request: MetadataToLLM) -> str:
        model = request.model or self._settings.gemini_model

        if not model:
            raise LLMRequestError("Gemini model is not configured.")

        return model

    def _get_function_calls(self, response) -> list:
        if not response.candidates:
            return []
        parts = response.candidates[0].content.parts or []
        return [part.function_call for part in parts if part.function_call is not None]

    async def _tool_complete(
        self,
        model: str,
        contents: list,
        system_instruction: str,
        operation: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        user_id: str | None = None,
    ) -> tuple:
        started_at = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    tools=GEMINI_TOOLS,
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds * 1000,
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(f"Gemini {operation} failed: {exc}") from exc
        latency_ms = int((perf_counter() - started_at) * 1000)

        usage_delta = None
        if response.usage_metadata is not None:
            usage_delta = TokenUsage(
                input_tokens=response.usage_metadata.prompt_token_count or 0,
                output_tokens=(response.usage_metadata.candidates_token_count or 0)
                + (response.usage_metadata.thoughts_token_count or 0),
                total_tokens=response.usage_metadata.total_token_count or 0,
            )

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=response,
            latency_ms=latency_ms,
            user_id=user_id,
            operation=operation,
        )

        if not response.candidates:
            raise LLMRequestError(f"Gemini returned no choices for {operation}.")

        return response, usage_delta

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

    async def generate_milestone_proposals(
        self, request: MilestoneProposalsToLLM
    ) -> MilestoneProposalsFromLLM:
        model = self._resolve_model(request)

        started_at = perf_counter()
        try:
            response = await self._client.aio.models.generate_content(
                model=model,
                contents=build_milestone_proposal_user_prompt(request.goal_data),
                config=types.GenerateContentConfig(
                    system_instruction=MILESTONE_PROPOSAL_SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                    response_schema=MilestoneProposalListLLMSchema,
                    temperature=request.temperature,
                    max_output_tokens=request.max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds * 1000,
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(f"Gemini generate_milestone_proposals failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=response,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="generate_milestone_proposals",
        )

        if not response.candidates:
            raise LLMRequestError("Gemini returned no choices for generate_milestone_proposals.")

        first_choice = response.candidates[0]
        parsed = response.parsed

        if parsed is None:
            raise LLMRequestError("Gemini returned an unparsable generate_milestone_proposals response.")

        usage = None
        if response.usage_metadata is not None:
            usage = TokenUsage(
                input_tokens=response.usage_metadata.prompt_token_count,
                output_tokens=(response.usage_metadata.candidates_token_count or 0)
                + (response.usage_metadata.thoughts_token_count or 0),
                total_tokens=response.usage_metadata.total_token_count,
            )

        return MilestoneProposalsFromLLM(
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=response.model_version or model,
            proposals=parsed,
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
        system_instruction = CREATE_CONVERSATION_SYSTEM_INSTRUCTION[request_data.agent_type]

        contents = [
            types.Content(role="user", parts=[types.Part(text=request_data.content)])
        ]

        started_at = perf_counter()
        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0
        usage_received = False

        response, usage_delta = await self._tool_complete(
            model, contents, system_instruction, "create_conversation",
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            user_id=request.user_id,
        )
        if usage_delta:
            usage_received = True
            total_input_tokens += usage_delta.input_tokens
            total_output_tokens += usage_delta.output_tokens
            total_tokens += usage_delta.total_tokens

        for _ in range(MAX_TOOL_ITERATIONS):
            function_calls = self._get_function_calls(response)
            if not function_calls:
                break

            if request.tool_executor is None:
                raise LLMRequestError(
                    "Gemini requested a tool but no tool executor is available."
                )

            contents.append(response.candidates[0].content)
            result_parts = []
            for fc in function_calls:
                args = dict(fc.args) if fc.args else {}
                result = request.tool_executor(fc.name, args)
                if asyncio.iscoroutine(result):
                    result = await result
                result_parts.append(
                    types.Part.from_function_response(name=fc.name, response=result)
                )
            contents.append(types.Content(role="user", parts=result_parts))

            tool_names = "\n".join(fc.name for fc in function_calls)
            response, usage_delta = await self._tool_complete(
                model, contents, system_instruction, tool_names,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                user_id=request.user_id,
            )
            if usage_delta:
                usage_received = True
                total_input_tokens += usage_delta.input_tokens
                total_output_tokens += usage_delta.output_tokens
                total_tokens += usage_delta.total_tokens

        if self._get_function_calls(response):
            raise LLMRequestError("Gemini exceeded the maximum number of tool iterations.")

        final_started_at = perf_counter()
        try:
            final_response = await self._client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=NewConvoFromLLMSchema,
                    temperature=request.temperature,
                    max_output_tokens=request.max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds * 1000,
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(f"Gemini create_conversation failed: {exc}") from exc
        final_time_ms = int((perf_counter() - final_started_at) * 1000)

        if final_response.usage_metadata is not None:
            usage_received = True
            total_input_tokens += final_response.usage_metadata.prompt_token_count or 0
            total_output_tokens += (
                (final_response.usage_metadata.candidates_token_count or 0)
                + (final_response.usage_metadata.thoughts_token_count or 0)
            )
            total_tokens += final_response.usage_metadata.total_token_count or 0

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=final_response,
            latency_ms=final_time_ms,
            user_id=request.user_id,
            operation="create_conversation_final",
        )

        if not final_response.candidates:
            raise LLMRequestError("Gemini returned no choices for create_conversation.")

        response_time_ms = int((perf_counter() - started_at) * 1000)

        first_choice = final_response.candidates[0]
        parsed = final_response.parsed

        if parsed is None:
            raise LLMRequestError(
                "Gemini returned an unparsable create_conversation response."
            )

        usage = None
        if usage_received:
            usage = TokenUsage(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                total_tokens=total_tokens,
            )

        return NewConvoFromLLM(
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=final_response.model_version or model,
            llm_data=parsed,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=final_response.response_id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
            ) if usage_received else None,
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
        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0
        usage_received = False

        response, usage_delta = await self._tool_complete(
            model, contents, system_instruction, "respond_to_message",
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            user_id=request.user_id,
        )
        if usage_delta:
            usage_received = True
            total_input_tokens += usage_delta.input_tokens
            total_output_tokens += usage_delta.output_tokens
            total_tokens += usage_delta.total_tokens

        for _ in range(MAX_TOOL_ITERATIONS):
            function_calls = self._get_function_calls(response)
            if not function_calls:
                break

            if request.tool_executor is None:
                raise LLMRequestError("Gemini requested a tool but no tool executor is available.")

            contents.append(response.candidates[0].content)
            result_parts = []
            for fc in function_calls:
                args = dict(fc.args) if fc.args else {}
                result = request.tool_executor(fc.name, args)
                if asyncio.iscoroutine(result):
                    result = await result
                result_parts.append(
                    types.Part.from_function_response(name=fc.name, response=result)
                )
            contents.append(types.Content(role="user", parts=result_parts))

            tool_names = "\n".join(fc.name for fc in function_calls)
            response, usage_delta = await self._tool_complete(
                model, contents, system_instruction, tool_names,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                user_id=request.user_id,
            )
            if usage_delta:
                usage_received = True
                total_input_tokens += usage_delta.input_tokens
                total_output_tokens += usage_delta.output_tokens
                total_tokens += usage_delta.total_tokens

        if self._get_function_calls(response):
            raise LLMRequestError("Gemini exceeded the maximum number of tool iterations.")

        final_started_at = perf_counter()
        try:
            final_response = await self._client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=MessageFromLLMSchema,
                    temperature=request.temperature,
                    max_output_tokens=request.max_tokens,
                    http_options=types.HttpOptions(
                        timeout=self._settings.llm_request_timeout_seconds * 1000,
                    ),
                ),
            )
        except errors.APIError as exc:
            raise LLMProviderError(f"Gemini respond_to_message failed: {exc}") from exc
        final_time_ms = int((perf_counter() - final_started_at) * 1000)

        if final_response.usage_metadata is not None:
            usage_received = True
            total_input_tokens += final_response.usage_metadata.prompt_token_count or 0
            total_output_tokens += (
                (final_response.usage_metadata.candidates_token_count or 0)
                + (final_response.usage_metadata.thoughts_token_count or 0)
            )
            total_tokens += final_response.usage_metadata.total_token_count or 0

        await log_gemini_completion_usage_async(
            settings=self._settings,
            model=model,
            response=final_response,
            latency_ms=final_time_ms,
            user_id=request.user_id,
            operation="respond_to_message_final",
        )

        if not final_response.candidates:
            raise LLMRequestError("Gemini returned no choices for respond_to_message.")

        response_time_ms = int((perf_counter() - started_at) * 1000)

        first_choice = final_response.candidates[0]
        parsed = final_response.parsed

        if parsed is None:
            raise LLMRequestError(
                "Gemini returned an unparsable respond_to_message response."
            )

        usage = None
        if usage_received:
            usage = TokenUsage(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                total_tokens=total_tokens,
            )

        return MessageFromLLM(
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=final_response.model_version or model,
            llm_data=parsed,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=final_response.response_id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
            ) if usage_received else None,
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
