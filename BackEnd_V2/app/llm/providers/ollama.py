import asyncio
import json
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
    MILESTONE_PROPOSAL_SYSTEM_INSTRUCTION,
    TASK_PROPOSAL_SYSTEM_INSTRUCTION,
    RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION,
    USER_MEMORY_EXTRACTION_SYSTEM_INSTRUCTION,
    build_goal_refinement_user_prompt,
    build_milestone_proposal_user_prompt,
    build_task_proposal_user_prompt,
    CREATE_CONVERSATION_SYSTEM_INSTRUCTION,
)
from app.schemas.goals import RefineGoalFromLLMSchema
from app.schemas.milestones import MilestoneProposalListLLMSchema
from app.schemas.tasks import TaskProposalListLLMSchema
from app.schemas.memory import MemoryExtractionFromLLMSchema
from app.llm.models import (
    MessageToLLM,
    MessageFromLLM,
    TokenUsage,
    RefineGoalToLLM,
    RefineGoalFromLLM,
    MilestoneProposalsToLLM,
    MilestoneProposalsFromLLM,
    TaskProposalsToLLM,
    TaskProposalsFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    ConversationContextToLLM,
    ConversationContextFromLLM,
    ExtractUserMemoryToLLM,
    ExtractUserMemoryFromLLM,
)
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.exceptions import (
    LLMHealthCheckError,
    LLMProviderError,
    LLMRequestError,
)
from app.llm.tools import MAX_TOOL_ITERATIONS, AGENT_TOOL_DEFINITIONS, TERMINAL_TOOL_NAMES


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

    async def _tool_complete(
        self,
        model: str,
        messages: list[dict],
        operation: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        user_id: str | None = None,
        agent_type: str = "shadow",
    ) -> tuple:
        tools = AGENT_TOOL_DEFINITIONS.get(agent_type, [])
        started_at = perf_counter()
        try:
            kwargs = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if tools:
                kwargs["tools"] = tools
            completion = await self._client.chat.completions.create(**kwargs)
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama {operation} failed: {exc}") from exc
        latency_ms = int((perf_counter() - started_at) * 1000)

        usage_delta = None
        if completion.usage is not None:
            usage_delta = TokenUsage(
                input_tokens=completion.usage.prompt_tokens or 0,
                output_tokens=completion.usage.completion_tokens or 0,
                total_tokens=completion.usage.total_tokens or 0,
            )

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=latency_ms,
            user_id=user_id,
            operation=operation,
        )

        if not completion.choices:
            raise LLMRequestError(f"Ollama returned no choices for {operation}.")

        return completion, usage_delta

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

    async def generate_milestone_proposals(
        self, request: MilestoneProposalsToLLM
    ) -> MilestoneProposalsFromLLM:
        model = self._resolve_model(request)

        messages = [
            {
                "role": Role.SYSTEM,
                "content": MILESTONE_PROPOSAL_SYSTEM_INSTRUCTION,
            },
            {
                "role": Role.USER,
                "content": build_milestone_proposal_user_prompt(request.goal_data),
            },
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=MilestoneProposalListLLMSchema,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama generate_milestone_proposals failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="generate_milestone_proposals",
        )

        if not completion.choices:
            raise LLMRequestError("Ollama returned no choices for generate_milestone_proposals.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused generate_milestone_proposals response: {message.refusal}"
                )
            raise LLMRequestError("Ollama returned an unparsable generate_milestone_proposals response.")

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return MilestoneProposalsFromLLM(
            proposals=parsed,
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
        )

    async def generate_task_proposals(self, request: TaskProposalsToLLM) -> TaskProposalsFromLLM:
        model = self._resolve_model(request)

        messages = [
            {
                "role": Role.SYSTEM,
                "content": TASK_PROPOSAL_SYSTEM_INSTRUCTION,
            },
            {
                "role": Role.USER,
                "content": build_task_proposal_user_prompt(request.goal_data, request.milestone_data),
            },
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=TaskProposalListLLMSchema,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama generate_task_proposals failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="generate_task_proposals",
        )

        if not completion.choices:
            raise LLMRequestError("Ollama returned no choices for generate_task_proposals.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused generate_task_proposals response: {message.refusal}"
                )
            raise LLMRequestError("Ollama returned an unparsable generate_task_proposals response.")

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return TaskProposalsFromLLM(
            proposals=parsed,
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
        system_content = CREATE_CONVERSATION_SYSTEM_INSTRUCTION[request_data.agent_type]
        if request.user_memory:
            system_content += f"\n\n{request.user_memory}"
        messages = [
            {
                "role": Role.SYSTEM,
                "content": system_content,
            },
        ]
        _ctx_parts = []
        if request.goal_id is not None:
            _ctx_parts.append(f"Goal ID: {request.goal_id}")
        if request.milestone_id is not None:
            _ctx_parts.append(f"Milestone ID: {request.milestone_id}")
        if _ctx_parts:
            messages.append({
                "role": Role.SYSTEM,
                "content": (
                    "Active context — " + ", ".join(_ctx_parts) + ". "
                    "When calling tools that require a goal_id or milestone_id, use these exact values."
                ),
            })
        messages.append({"role": Role.USER, "content": request_data.content})

        started_at = perf_counter()
        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0
        usage_received = False

        # Use beta.parse with both tools and response_format in a single call.
        # Ollama's OpenAI-compatible endpoint supports this combination: when the
        # model calls a tool, tool_calls is populated and message.parsed is None;
        # when it answers directly, message.parsed already holds structured output.
        # This avoids a mandatory second call in the no-tool path.
        initial_kwargs: dict = {
            "model": model,
            "messages": messages,
            "response_format": NewConvoFromLLMSchema,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        _agent_tools = AGENT_TOOL_DEFINITIONS.get(request_data.agent_type, [])
        if _agent_tools:
            initial_kwargs["tools"] = _agent_tools

        initial_started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(**initial_kwargs)
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama create_conversation failed: {exc}") from exc
        initial_latency_ms = int((perf_counter() - initial_started_at) * 1000)

        if completion.usage is not None:
            usage_received = True
            total_input_tokens += completion.usage.prompt_tokens or 0
            total_output_tokens += completion.usage.completion_tokens or 0
            total_tokens += completion.usage.total_tokens or 0

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=initial_latency_ms,
            user_id=request.user_id,
            operation="create_conversation",
        )

        terminal_break = False
        tools_were_called = False
        for _ in range(MAX_TOOL_ITERATIONS):
            first_choice = completion.choices[0]
            tool_calls = first_choice.message.tool_calls

            if not tool_calls:
                break

            tools_were_called = True
            if request.tool_executor is None:
                raise LLMRequestError("Ollama requested a tool but no tool executor is available.")

            messages.append(
                {
                    "role": Role.ASSISTANT,
                    "content": first_choice.message.content,
                    "tool_calls": [
                        {
                            "id": tool_call.id,
                            "type": "function",
                            "function": {
                                "name": tool_call.function.name,
                                "arguments": tool_call.function.arguments,
                            },
                        }
                        for tool_call in tool_calls
                    ],
                }
            )

            for tool_call in tool_calls:
                arguments = json.loads(tool_call.function.arguments or "{}")
                result = request.tool_executor(tool_call.function.name, arguments)
                if asyncio.iscoroutine(result):
                    result = await result
                messages.append(
                    {
                        "role": Role.TOOL,
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result),
                    }
                )

            # Terminal tools (e.g. create_goal_proposal) fully complete their action
            # by writing to context.action_data; their return value is a scripted
            # string telling the LLM what to say — re-invoking the LLM would just
            # narrate that string at extra token cost. Skip straight to the final
            # structured parse, which composes the response from the tool results.
            called_names = {tc.function.name for tc in tool_calls}
            if called_names.issubset(TERMINAL_TOOL_NAMES):
                terminal_break = True
                break

            tool_names = "\n".join(tool_call.function.name for tool_call in tool_calls)
            completion, usage_delta = await self._tool_complete(
                model, messages, tool_names,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                user_id=request.user_id,
                agent_type=request_data.agent_type,
            )
            if usage_delta:
                usage_received = True
                total_input_tokens += usage_delta.input_tokens
                total_output_tokens += usage_delta.output_tokens
                total_tokens += usage_delta.total_tokens

        if not terminal_break and completion.choices[0].message.tool_calls:
            raise LLMRequestError("Ollama exceeded the maximum number of tool iterations.")

        if not tools_were_called:
            # Model answered directly without calling any tools — the initial beta.parse
            # already produced structured output, so no second call is needed.
            if not completion.choices:
                raise LLMRequestError("Ollama returned no choices for create_conversation.")
            first_choice = completion.choices[0]
            message = first_choice.message
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused create_conversation response: {message.refusal}"
                )
            parsed = message.parsed
            if parsed is None:
                raise LLMRequestError("Ollama returned an unparsable create_conversation response.")
            final_completion = completion
        else:
            # Tools were invoked — run the final structured parse to compose the response.
            final_completion_started_at = perf_counter()
            try:
                final_completion = await self._client.beta.chat.completions.parse(
                    model=model,
                    messages=messages,
                    response_format=NewConvoFromLLMSchema,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens,
                )
            except (APIConnectionError, APIStatusError, OpenAIError) as exc:
                raise LLMProviderError(f"Ollama create_conversation failed: {exc}") from exc
            final_completion_time_ms = int((perf_counter() - final_completion_started_at) * 1000)

            if final_completion.usage is not None:
                usage_received = True
                total_input_tokens += final_completion.usage.prompt_tokens or 0
                total_output_tokens += final_completion.usage.completion_tokens or 0
                total_tokens += final_completion.usage.total_tokens or 0

            await log_ollama_completion_usage_async(
                settings=self._settings,
                model=model,
                completion=final_completion,
                latency_ms=final_completion_time_ms,
                user_id=request.user_id,
                operation="create_conversation_final",
            )

            if not final_completion.choices:
                raise LLMRequestError("Ollama returned no choices for create_conversation.")
            first_choice = final_completion.choices[0]
            message = first_choice.message
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused create_conversation response: {message.refusal}"
                )
            parsed = message.parsed
            if parsed is None:
                raise LLMRequestError("Ollama returned an unparsable create_conversation response.")

        response_time_ms = int((perf_counter() - started_at) * 1000)

        usage = None
        if usage_received:
            usage = TokenUsage(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                total_tokens=total_tokens,
            )

        return NewConvoFromLLM(
            llm_data=parsed,
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=final_completion.model or model,
            finish_reason=first_choice.finish_reason,
            usage=usage,
            response_id=final_completion.id,
            response_time_ms=response_time_ms,
        )

    async def respond_to_message(self, request: MessageToLLM) -> MessageFromLLM:
        model = self._resolve_model(request)

        conversation_context = (
            f"Stable context:\n{request.stable_context}\n\n"
            f"Conversation summary:\n{request.context_summary}"
        )
        if request.user_memory:
            conversation_context += f"\n\n{request.user_memory}"
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
        ]
        _ctx_parts = []
        if request.goal_id is not None:
            _ctx_parts.append(f"Goal ID: {request.goal_id}")
        if request.milestone_id is not None:
            _ctx_parts.append(f"Milestone ID: {request.milestone_id}")
        if _ctx_parts:
            messages.append({
                "role": Role.SYSTEM,
                "content": (
                    "Active context — " + ", ".join(_ctx_parts) + ". "
                    "When calling tools that require a goal_id or milestone_id, use these exact values."
                ),
            })
        messages.append({"role": Role.USER, "content": request.request_data})

        started_at = perf_counter()
        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0
        usage_received = False

        completion, usage_delta = await self._tool_complete(
            model, messages, "respond_to_message",
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            user_id=request.user_id,
            agent_type=request.agent_type,
        )
        if usage_delta:
            usage_received = True
            total_input_tokens += usage_delta.input_tokens
            total_output_tokens += usage_delta.output_tokens
            total_tokens += usage_delta.total_tokens

        for _ in range(MAX_TOOL_ITERATIONS):
            first_choice = completion.choices[0]
            tool_calls = first_choice.message.tool_calls

            if not tool_calls:
                break

            if request.tool_executor is None:
                raise LLMRequestError("Ollama requested a tool but no tool executor is available.")

            messages.append(
                {
                    "role": Role.ASSISTANT,
                    "content": first_choice.message.content,
                    "tool_calls": [
                        {
                            "id": tool_call.id,
                            "type": "function",
                            "function": {
                                "name": tool_call.function.name,
                                "arguments": tool_call.function.arguments,
                            },
                        }
                        for tool_call in tool_calls
                    ],
                }
            )

            for tool_call in tool_calls:
                arguments = json.loads(tool_call.function.arguments or "{}")
                result = request.tool_executor(tool_call.function.name, arguments)
                if asyncio.iscoroutine(result):
                    result = await result
                messages.append(
                    {
                        "role": Role.TOOL,
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result),
                    }
                )

            tool_names = "\n".join(tool_call.function.name for tool_call in tool_calls)
            completion, usage_delta = await self._tool_complete(
                model, messages, tool_names,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                user_id=request.user_id,
                agent_type=request.agent_type,
            )
            if usage_delta:
                usage_received = True
                total_input_tokens += usage_delta.input_tokens
                total_output_tokens += usage_delta.output_tokens
                total_tokens += usage_delta.total_tokens

        if completion.choices[0].message.tool_calls:
            raise LLMRequestError("Ollama exceeded the maximum number of tool iterations.")

        response_time_ms = int((perf_counter() - started_at) * 1000)

        first_choice = completion.choices[0]
        message = first_choice.message
        if message.refusal:
            raise LLMRequestError(f"Ollama refused respond_to_message response: {message.refusal}")

        content = message.content
        if not content:
            raise LLMRequestError("Ollama returned an empty respond_to_message response.")

        parsed = MessageFromLLMSchema(content=content)

        usage = None
        if usage_received:
            usage = TokenUsage(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                total_tokens=total_tokens,
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

    async def extract_user_memory(
        self, request: ExtractUserMemoryToLLM
    ) -> ExtractUserMemoryFromLLM:
        model = self._resolve_model(request)

        existing_block = (
            json.dumps(request.existing_memories, ensure_ascii=False, indent=2)
            if request.existing_memories
            else "[]"
        )
        conversation_block = (
            f"Stable context:\n{request.stable_context}\n\n"
            f"Conversation summary:\n{request.context_summary}\n\n"
            "Recent messages:\n"
            + "\n".join(f"[{m['role']}]: {m['content']}" for m in request.messages)
        )
        user_prompt = (
            f"Existing user memories:\n{existing_block}\n\n"
            f"Conversation to analyze:\n{conversation_block}"
        )

        messages = [
            {"role": Role.SYSTEM, "content": USER_MEMORY_EXTRACTION_SYSTEM_INSTRUCTION},
            {"role": Role.USER, "content": user_prompt},
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=MemoryExtractionFromLLMSchema,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama extract_user_memory failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_ollama_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="extract_user_memory",
        )

        if not completion.choices:
            raise LLMRequestError("Ollama returned no choices for extract_user_memory.")

        first_choice = completion.choices[0]
        message = first_choice.message
        parsed = message.parsed

        if parsed is None:
            if message.refusal:
                raise LLMRequestError(
                    f"Ollama refused extract_user_memory response: {message.refusal}"
                )
            raise LLMRequestError("Ollama returned an unparsable extract_user_memory response.")

        usage = None
        if completion.usage is not None:
            usage = TokenUsage(
                input_tokens=completion.usage.prompt_tokens,
                output_tokens=completion.usage.completion_tokens,
                total_tokens=completion.usage.total_tokens,
            )

        return ExtractUserMemoryFromLLM(
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=completion.model or model,
            llm_data=parsed,
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
