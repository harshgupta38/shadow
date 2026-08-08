from datetime import date
from time import perf_counter

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, OpenAIError
from app.llm.enums import LLMProvider, Role
from app.schemas.goals import UnderstandGoalResponse
from app.llm.models import RefineGoalResponse, RefineGoalRequest, TokenUsage
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.exceptions import LLMHealthCheckError, LLMProviderError, LLMRequestError


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

    def _resolve_model(self, request: RefineGoalRequest) -> str:
        model = request.model or self._settings.ollama_model

        if not model:
            raise LLMRequestError("Ollama model is not configured.")
        
        return model

    async def refine_goal(self, request: RefineGoalRequest) -> RefineGoalResponse:
        model = self._resolve_model(request)

        request_data = request.request_data
        messages = [
            {
                "role": Role.SYSTEM,
                "content": (
                    "You are an expert goal coach.\n"
                    "Analyze the user's responses to build a complete goal profile.\n"
                    "Base your conclusions on the user's answers.\n"
                    "When required information is missing, infer the most reasonable value from the available context.\n"
                    "Do not contradict the user's responses.\n"
                    "Be realistic and concise.\n"
                    "Return only a JSON object matching the required schema."
                ),
            },
            {
                "role": Role.USER,
                "content": (
                    f"Current Date: {date.today().isoformat()}\n\n"
                    "User Responses\n\n"
                    f"Goal: {request_data.goal.strip()}\n"
                    f"Why: {request_data.why.strip()}\n"
                    f"Success: {request_data.success.strip()}\n"
                    f"Current Situation: {request_data.reality.strip()}\n"
                    f"Obstacles: {request_data.obstacles.strip()}\n\n"
                    "Additional Instructions:\n"
                    "- If the user does not specify a target date, estimate a realistic future date.\n"
                    "- Success metrics should be specific and measurable.\n"
                    "- Infer strengths from the user's current situation and responses.\n"
                    "- Infer coaching insights that are directly supported by the user's responses."
                ),
            },
        ]

        started_at = perf_counter()
        try:
            completion = await self._client.beta.chat.completions.parse(
                model=model,
                messages=messages,
                response_format=UnderstandGoalResponse,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
            )
        except (APIConnectionError, APIStatusError, OpenAIError) as exc:
            raise LLMProviderError(f"Ollama refine_goal failed: {exc}") from exc
        response_time_ms = int((perf_counter() - started_at) * 1000)

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

        return RefineGoalResponse(
            provider=LLMProvider.OLLAMA,
            model=completion.model or model,
            refined_data=parsed,
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
