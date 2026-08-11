from functools import lru_cache
from time import perf_counter

from app.analysis.llm_usage_logger import LLMUsageLogger
from app.analysis.service import AnalysisService, get_analysis_service
from app.llm.models import RefineGoalRequest, RefineGoalResponse
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import LLMProvider
from app.llm.exceptions import LLMConfigurationError
from app.schemas.goals import UnderstandGoalRequest
from app.llm.providers import ClaudeProvider, GeminiProvider, OllamaProvider, OpenAIProvider


class LLMService:
    def __init__(
        self,
        settings: LLMSettings | None = None,
        provider: BaseLLMProvider | None = None,
        analysis_service: AnalysisService | None = None,
    ) -> None:
        self._settings = settings or llm_settings
        self._provider = provider or self._build_provider(self._settings)
        self._analysis_logger = LLMUsageLogger(
            analysis_service or get_analysis_service(),
            self._settings,
        )

    # Builds the concrete LLM provider from configuration.
    # Flow:
    # 1) Read configured provider from `settings.llm_provider` (loaded from .env / defaults).
    # 2) Look up the matching provider class in `provider_registry`.
    # 3) If not found, raise LLMConfigurationError (invalid/unsupported provider value).
    # 4) Instantiate and return the provider with the same settings.
    def _build_provider(self, settings: LLMSettings) -> BaseLLMProvider:
        provider_registry: dict[LLMProvider, type[BaseLLMProvider]] = {
            LLMProvider.OLLAMA: OllamaProvider,
            LLMProvider.OPENAI: OpenAIProvider,
            LLMProvider.GEMINI: GeminiProvider,
            LLMProvider.CLAUDE: ClaudeProvider,
        }

        provider_cls = provider_registry.get(settings.llm_provider)
        if provider_cls is None:
            raise LLMConfigurationError(
                f"Unsupported LLM provider configured: {settings.llm_provider.value}"
            )

        return provider_cls(settings=settings)

    async def refine_goal(
        self,
        request_data: UnderstandGoalRequest,
        user_id: int | None = None,
    ) -> RefineGoalResponse:
        operation = "refine_goal"
        started_at = perf_counter()
        request = RefineGoalRequest(request_data=request_data)

        try:
            response = await self._provider.refine_goal(request)
        except Exception as exc:
            latency_ms = int((perf_counter() - started_at) * 1000)
            self._analysis_logger.log_refine_goal_failure(
                user_id=user_id,
                operation=operation,
                error=exc,
                latency_ms=latency_ms,
            )
            raise

        if response is None or response.refined_data is None:
            error = self._analysis_logger.missing_refined_goal_error()
            self._analysis_logger.log_refine_goal_failure(
                user_id=user_id,
                operation=operation,
                error=error,
                latency_ms=int((perf_counter() - started_at) * 1000),
            )
            raise error

        self._analysis_logger.log_refine_goal_success(
            user_id=user_id,
            operation=operation,
            response=response,
        )

        return response

    async def health_check(self) -> bool:
        return await self._provider.health_check()

    async def close(self) -> None:
        await self._provider.close()


@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    return LLMService()
