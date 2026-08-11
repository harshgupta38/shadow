from time import perf_counter

from anthropic import APIConnectionError, APIError, APIStatusError, AsyncAnthropic
from pydantic import ValidationError

from app.analysis.llm_usage_logger import log_claude_completion_usage_async
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.cost import calculate_token_cost
from app.llm.enums import LLMProvider
from app.llm.exceptions import LLMHealthCheckError, LLMProviderError, LLMRequestError
from app.llm.knowledge_base import (
    GOAL_REFINEMENT_SYSTEM_INSTRUCTION_CLAUDE,
    build_goal_refinement_user_prompt,
)
from app.llm.models import RefineGoalRequest, RefineGoalResponse, TokenUsage
from app.schemas.goals import UnderstandGoalResponse


class ClaudeProvider(BaseLLMProvider):
    def __init__(self, settings: LLMSettings | None = None):
        self._settings = settings or llm_settings
        self._client = AsyncAnthropic(
            api_key=self._settings.claude_api_key,
            timeout=self._settings.llm_request_timeout_seconds,
        )

    def _resolve_model(self, request: RefineGoalRequest) -> str:
        model = request.model or self._settings.claude_model
        if not model:
            raise LLMRequestError("Claude model is not configured.")
        return model

    def _extract_text_content(self, response) -> str:
        for block in response.content:
            block_text = getattr(block, "text", None)
            if isinstance(block_text, str) and block_text.strip():
                return block_text.strip()

        raise LLMRequestError("Claude returned no text content for refine_goal.")

    @staticmethod
    def _strip_code_fence(text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            first_newline = text.find("\n")
            text = text[first_newline + 1:] if first_newline != -1 else text[3:]
        if text.endswith("```"):
            last_newline = text.rfind("\n")
            text = text[:last_newline] if last_newline != -1 else text[:-3]
        return text.strip()

    def _parse_response_payload(self, response) -> UnderstandGoalResponse:
        try:
            raw = self._strip_code_fence(self._extract_text_content(response))
            return UnderstandGoalResponse.model_validate_json(raw)
        except ValidationError as exc:
            raise LLMRequestError(
                "Claude returned a response that does not match UnderstandGoalResponse schema."
            ) from exc

    async def refine_goal(self, request: RefineGoalRequest) -> RefineGoalResponse:
        model = self._resolve_model(request)

        started_at = perf_counter()
        try:
            kwargs = {
                "model": model,
                "system": GOAL_REFINEMENT_SYSTEM_INSTRUCTION_CLAUDE,
                "messages": [
                    {
                        "role": "user",
                        "content": build_goal_refinement_user_prompt(request.request_data),
                    }
                ],
                "max_tokens": request.max_tokens or 2048,
            }

            if request.temperature is not None:
                kwargs["temperature"] = request.temperature

            completion = await self._client.messages.create(**kwargs)

            print(completion)

        except (APIConnectionError, APIStatusError, APIError) as exc:
            raise LLMProviderError(f"Claude refine_goal failed: {exc}") from exc

        response_time_ms = int((perf_counter() - started_at) * 1000)

        log_claude_completion_usage_async(
            settings=self._settings,
            model=model,
            completion=completion,
            latency_ms=response_time_ms,
        )

        parsed = self._parse_response_payload(completion)

        usage = None
        if completion.usage is not None:
            input_tokens = completion.usage.input_tokens
            output_tokens = completion.usage.output_tokens
            usage = TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
            )

        return RefineGoalResponse(
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
                output_tokens=usage.output_tokens if usage and usage.output_tokens else 0,
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