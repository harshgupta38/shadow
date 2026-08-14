from time import perf_counter

from google import genai
from google.genai import types, errors

from app.analysis.llm_usage_logger import log_gemini_completion_usage_async
from app.llm.cost import calculate_token_cost
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import LLMProvider, Role
from app.llm.exceptions import (
    LLMConfigurationError,
    LLMHealthCheckError,
    LLMProviderError,
    LLMRequestError,
)
from app.llm.knowledge_base import (
    GOAL_REFINEMENT_SYSTEM_INSTRUCTION,
    build_goal_refinement_user_prompt,
)
from app.llm.models import (
    MessageToLLM,
    MessageFromLLM,
    RefineGoalToLLM,
    RefineGoalFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    TokenUsage,
)
from app.schemas.goals import RefineGoalFromLLMSchema


class GeminiProvider(BaseLLMProvider):

    def __init__(self, settings: LLMSettings | None = None):
        self._settings = settings or llm_settings
        self._client = genai.Client(api_key=self._settings.gemini_api_key)

    def _resolve_model(self, request: RefineGoalToLLM) -> str:
        model = request.model or self._settings.gemini_model

        if not model:
            raise LLMRequestError("Gemini model is not configured.")

        return model

    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        model = self._resolve_model(request)

        request_data = request.request_data

        started_at = perf_counter()
        try:
            response = self._client.models.generate_content(
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
                output_tokens=response.usage_metadata.candidates_token_count
                + response.usage_metadata.thoughts_token_count,
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
        raise LLMConfigurationError(
            "GeminiProvider does not support create_conversation yet."
        )

    async def respond_to_message(self, request: MessageToLLM) -> MessageFromLLM:
        raise LLMConfigurationError(
            "GeminiProvider does not support respond_to_message yet."
        )

    async def health_check(self) -> bool:
        # Gemini health check using the /models endpoint.
        try:
            await self._client.models.list()
            return True
        except errors.APIError as exc:
            raise LLMHealthCheckError(f"Gemini health check failed: {exc}") from exc

    async def close(self) -> None:
        await self._client.close()
