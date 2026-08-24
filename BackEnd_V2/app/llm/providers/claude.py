import asyncio
import json
from time import perf_counter

from anthropic import APIConnectionError, APIError, APIStatusError, AsyncAnthropic
from pydantic import ValidationError

from app.analysis.llm_usage_logger import log_claude_completion_usage_async
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.cost import calculate_token_cost
from app.llm.enums import LLMProvider, Role
from app.llm.exceptions import (
    LLMHealthCheckError,
    LLMProviderError,
    LLMRequestError,
)
from app.llm.knowledge_base import (
    CONVERSATION_CONTEXT_SYSTEM_INSTRUCTION_CLAUDE,
    GOAL_REFINEMENT_SYSTEM_INSTRUCTION_CLAUDE,
    MILESTONE_PROPOSAL_SYSTEM_INSTRUCTION_CLAUDE,
    RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION_CLAUDE,
    CREATE_CONVERSATION_SYSTEM_INSTRUCTION_CLAUDE,
    build_goal_refinement_user_prompt,
    build_milestone_proposal_user_prompt,
)
from app.llm.models import (
    ConversationContextToLLM,
    ConversationContextFromLLM,
    TaskProposalsToLLM,
    TaskProposalsFromLLM,
    MessageToLLM,
    MessageFromLLM,
    RefineGoalToLLM,
    RefineGoalFromLLM,
    MilestoneProposalsToLLM,
    MilestoneProposalsFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    TokenUsage,
    MetadataToLLM,
)
from app.schemas.goals import RefineGoalFromLLMSchema
from app.schemas.milestones import MilestoneProposalListLLMSchema
from app.schemas.chat import (
    ConversationContextFromLLMSchema,
    MessageFromLLMSchema,
    NewConvoFromLLMSchema,
)
from app.llm.tools import MAX_TOOL_ITERATIONS, AGENT_TOOL_DEFINITIONS


def _to_claude_tools(tool_defs: list[dict]) -> list[dict]:
    return [
        {
            "name": t["function"]["name"],
            "description": t["function"]["description"],
            "input_schema": t["function"]["parameters"],
        }
        for t in tool_defs
    ]


class ClaudeProvider(BaseLLMProvider):
    def __init__(self, settings: LLMSettings | None = None):
        self._settings = settings or llm_settings
        self._client = AsyncAnthropic(
            api_key=self._settings.claude_api_key,
            timeout=self._settings.llm_request_timeout_seconds,
        )

    def _resolve_model(self, request: MetadataToLLM) -> str:
        model = request.model or self._settings.claude_model
        if not model:
            raise LLMRequestError("Claude model is not configured.")
        return model

    def _extract_text_content(self, response) -> str:
        for block in response.content:
            block_text = getattr(block, "text", None)
            if isinstance(block_text, str) and block_text.strip():
                return block_text.strip()

        raise LLMRequestError("Claude returned no text content.")

    @staticmethod
    def _strip_code_fence(text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            first_newline = text.find("\n")
            text = text[first_newline + 1 :] if first_newline != -1 else text[3:]
        if text.endswith("```"):
            last_newline = text.rfind("\n")
            text = text[:last_newline] if last_newline != -1 else text[:-3]
        return text.strip()

    def _parse_RefineGoalFromLLMSchema(self, response) -> RefineGoalFromLLMSchema:
        try:
            raw = self._strip_code_fence(self._extract_text_content(response))
            return RefineGoalFromLLMSchema.model_validate_json(raw)
        except ValidationError as exc:
            raise LLMRequestError(
                "Claude returned a response that does not match RefineGoalFromLLMSchema schema."
            ) from exc

    def _parse_NewConvoFromLLMSchema(self, response) -> NewConvoFromLLMSchema:
        try:
            raw = self._strip_code_fence(self._extract_text_content(response))
            return NewConvoFromLLMSchema.model_validate_json(raw)
        except ValidationError as exc:
            raise LLMRequestError(
                "Claude returned a response that does not match NewConvoFromLLMSchema schema."
            ) from exc

    def _parse_MessageFromLLMSchema(self, response) -> MessageFromLLMSchema:
        try:
            raw = self._strip_code_fence(self._extract_text_content(response))
            return MessageFromLLMSchema.model_validate_json(raw)
        except ValidationError as exc:
            raise LLMRequestError(
                "Claude returned a response that does not match MessageFromLLMSchema schema."
            ) from exc

    def _parse_ConversationContextFromLLMSchema(
        self, response
    ) -> ConversationContextFromLLMSchema:
        try:
            raw = self._strip_code_fence(self._extract_text_content(response))
            return ConversationContextFromLLMSchema.model_validate_json(raw)
        except ValidationError as exc:
            raise LLMRequestError(
                "Claude returned a response that does not match ConversationContextFromLLMSchema schema."
            ) from exc

    async def _tool_complete(
        self,
        model: str,
        system: str,
        messages: list[dict],
        operation: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        user_id: str | None = None,
        agent_type: str = "shadow",
    ) -> tuple:
        started_at = perf_counter()
        try:
            kwargs = {
                "model": model,
                "system": system,
                "messages": messages,
                "max_tokens": max_tokens or 2048,
            }
            tools = _to_claude_tools(AGENT_TOOL_DEFINITIONS.get(agent_type, []))
            if tools:
                kwargs["tools"] = tools
            if temperature is not None:
                kwargs["temperature"] = temperature

            completion = await self._client.messages.create(**kwargs)
        except (APIConnectionError, APIStatusError, APIError) as exc:
            raise LLMProviderError(f"Claude {operation} failed: {exc}") from exc
        latency_ms = int((perf_counter() - started_at) * 1000)

        usage_delta = None
        if completion.usage is not None:
            input_tokens = completion.usage.input_tokens
            output_tokens = completion.usage.output_tokens
            usage_delta = TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
            )

        await log_claude_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=latency_ms,
            user_id=user_id,
            operation=operation,
        )

        return completion, usage_delta

    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        model = self._resolve_model(request)

        started_at = perf_counter()
        try:
            kwargs = {
                "model": model,
                "system": GOAL_REFINEMENT_SYSTEM_INSTRUCTION_CLAUDE,
                "messages": [
                    {
                        "role": Role.USER,
                        "content": build_goal_refinement_user_prompt(
                            request.request_data
                        ),
                    }
                ],
                "max_tokens": request.max_tokens or 2048,
            }

            if request.temperature is not None:
                kwargs["temperature"] = request.temperature

            completion = await self._client.messages.create(**kwargs)

        except (APIConnectionError, APIStatusError, APIError) as exc:
            raise LLMProviderError(f"Claude refine_goal failed: {exc}") from exc

        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_claude_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="refine_goal",
        )

        parsed = self._parse_RefineGoalFromLLMSchema(completion)

        usage = None
        if completion.usage is not None:
            input_tokens = completion.usage.input_tokens
            output_tokens = completion.usage.output_tokens
            usage = TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
            )

        return RefineGoalFromLLM(
            provider=LLMProvider.CLAUDE,
            model=model,
            model_str=completion.model or model,
            refined_data=parsed,
            finish_reason=completion.stop_reason or "unknown",
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=usage.input_tokens if usage and usage.input_tokens else 0,
                output_tokens=(
                    usage.output_tokens if usage and usage.output_tokens else 0
                ),
            ),
        )

    def _parse_MilestoneProposalListSchema(self, response) -> MilestoneProposalListLLMSchema:
        try:
            raw = self._strip_code_fence(self._extract_text_content(response))
            return MilestoneProposalListLLMSchema.model_validate_json(raw)
        except ValidationError as exc:
            raise LLMRequestError(
                "Claude returned a response that does not match MilestoneProposalListSchema schema."
            ) from exc

    async def generate_milestone_proposals(
        self, request: MilestoneProposalsToLLM
    ) -> MilestoneProposalsFromLLM:
        model = self._resolve_model(request)

        started_at = perf_counter()
        try:
            completion = await self._client.messages.create(
                model=model,
                system=MILESTONE_PROPOSAL_SYSTEM_INSTRUCTION_CLAUDE,
                messages=[
                    {
                        "role": Role.USER,
                        "content": build_milestone_proposal_user_prompt(request.goal_data),
                    }
                ],
                max_tokens=request.max_tokens or 2048,
            )
        except (APIConnectionError, APIStatusError, APIError) as exc:
            raise LLMProviderError(f"Claude generate_milestone_proposals failed: {exc}") from exc

        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_claude_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="generate_milestone_proposals",
        )

        parsed = self._parse_MilestoneProposalListSchema(completion)

        usage = None
        if completion.usage is not None:
            input_tokens = completion.usage.input_tokens
            output_tokens = completion.usage.output_tokens
            usage = TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
            )

        return MilestoneProposalsFromLLM(
            provider=LLMProvider.CLAUDE,
            model=model,
            model_str=completion.model or model,
            proposals=parsed,
            finish_reason=completion.stop_reason or "unknown",
            usage=usage,
            response_id=completion.id,
            response_time_ms=response_time_ms,
            cost=calculate_token_cost(
                model_key=model,
                input_tokens=usage.input_tokens if usage and usage.input_tokens else 0,
                output_tokens=(
                    usage.output_tokens if usage and usage.output_tokens else 0
                ),
            ),
        )

    async def generate_task_proposals(
        self, request: TaskProposalsToLLM
    ) -> TaskProposalsFromLLM:
        # TODO: implement — mirror generate_milestone_proposals using TASK_PROPOSAL_SYSTEM_INSTRUCTION_CLAUDE
        raise NotImplementedError

    async def create_conversation(self, request: NewConvoToLLM) -> NewConvoFromLLM:
        model = self._resolve_model(request)

        request_data = request.request_data
        system = CREATE_CONVERSATION_SYSTEM_INSTRUCTION_CLAUDE[request_data.agent_type]
        messages = [{"role": Role.USER, "content": request_data.content}]

        started_at = perf_counter()
        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0
        usage_received = False

        completion, usage_delta = await self._tool_complete(
            model, system, messages, "create_conversation",
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

        for _ in range(MAX_TOOL_ITERATIONS):
            if completion.stop_reason != "tool_use":
                break

            tool_use_blocks = [b for b in completion.content if b.type == "tool_use"]

            if request.tool_executor is None:
                raise LLMRequestError(
                    "Claude requested a tool but no tool executor is available."
                )

            messages.append({"role": "assistant", "content": completion.content})

            tool_results = []
            for block in tool_use_blocks:
                result = request.tool_executor(block.name, dict(block.input))
                if asyncio.iscoroutine(result):
                    result = await result
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    }
                )
            tool_results.append({"type": "text", "text": "Tool completed. Now return only the required JSON response."})
            messages.append({"role": "user", "content": tool_results})

            tool_names = "\n".join(b.name for b in tool_use_blocks)
            completion, usage_delta = await self._tool_complete(
                model, system, messages, tool_names,
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

        if completion.stop_reason == "tool_use":
            raise LLMRequestError(
                "Claude exceeded the maximum number of tool iterations."
            )

        response_time_ms = int((perf_counter() - started_at) * 1000)

        parsed = self._parse_NewConvoFromLLMSchema(completion)

        usage = None
        if usage_received:
            usage = TokenUsage(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                total_tokens=total_tokens,
            )

        return NewConvoFromLLM(
            provider=LLMProvider.CLAUDE,
            model=model,
            model_str=completion.model or model,
            llm_data=parsed,
            finish_reason=completion.stop_reason or "unknown",
            usage=usage,
            response_id=completion.id,
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

        conversation_context = (
            f"Stable context:\n{request.stable_context}\n\n"
            f"Conversation summary:\n{request.context_summary}"
        )
        system = (
            RESPOND_TO_MESSAGE_SYSTEM_INSTRUCTION_CLAUDE[request.agent_type]
            + f"\n\nConversation context:\n{conversation_context}"
        )
        messages = [
            *request.recent_messages,
            {"role": Role.USER, "content": request.request_data},
        ]

        started_at = perf_counter()
        total_input_tokens = 0
        total_output_tokens = 0
        total_tokens = 0
        usage_received = False

        completion, usage_delta = await self._tool_complete(
            model, system, messages, "respond_to_message",
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
            if completion.stop_reason != "tool_use":
                break

            tool_use_blocks = [b for b in completion.content if b.type == "tool_use"]

            if request.tool_executor is None:
                raise LLMRequestError(
                    "Claude requested a tool but no tool executor is available."
                )

            messages.append({"role": "assistant", "content": completion.content})

            tool_results = []
            for block in tool_use_blocks:
                result = request.tool_executor(block.name, dict(block.input))
                if asyncio.iscoroutine(result):
                    result = await result
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    }
                )
            tool_results.append({"type": "text", "text": "Tool completed. Now return only the required JSON response."})
            messages.append({"role": "user", "content": tool_results})

            tool_names = "\n".join(b.name for b in tool_use_blocks)
            completion, usage_delta = await self._tool_complete(
                model, system, messages, tool_names,
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

        if completion.stop_reason == "tool_use":
            raise LLMRequestError(
                "Claude exceeded the maximum number of tool iterations."
            )

        response_time_ms = int((perf_counter() - started_at) * 1000)

        parsed = self._parse_MessageFromLLMSchema(completion)

        usage = None
        if usage_received:
            usage = TokenUsage(
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                total_tokens=total_tokens,
            )

        return MessageFromLLM(
            provider=LLMProvider.CLAUDE,
            model=model,
            model_str=completion.model or model,
            llm_data=parsed,
            finish_reason=completion.stop_reason or "unknown",
            usage=usage,
            response_id=completion.id,
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

        started_at = perf_counter()
        try:
            kwargs = {
                "model": model,
                "system": CONVERSATION_CONTEXT_SYSTEM_INSTRUCTION_CLAUDE
                + f"\n\n{existing_context}",
                "messages": request.messages,
                "max_tokens": request.max_tokens or 2048,
            }

            if request.temperature is not None:
                kwargs["temperature"] = request.temperature

            completion = await self._client.messages.create(**kwargs)

        except (APIConnectionError, APIStatusError, APIError) as exc:
            raise LLMProviderError(
                f"Claude update_conversation_context failed: {exc}"
            ) from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

        await log_claude_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
            user_id=request.user_id,
            operation="update_conversation_context",
        )

        parsed = self._parse_ConversationContextFromLLMSchema(completion)

        usage = None
        if completion.usage is not None:
            input_tokens = completion.usage.input_tokens
            output_tokens = completion.usage.output_tokens
            usage = TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
            )

        return ConversationContextFromLLM(
            provider=LLMProvider.CLAUDE,
            model=model,
            model_str=completion.model or model,
            llm_data=parsed,
            finish_reason=completion.stop_reason or "unknown",
            usage=usage,
            response_id=completion.id,
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
        try:
            await self._client.messages.create(
                model=self._settings.claude_model,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
            return True
        except (APIConnectionError, APIStatusError, APIError) as exc:
            raise LLMHealthCheckError(f"Claude health check failed: {exc}") from exc

    async def close(self) -> None:
        await self._client.close()
