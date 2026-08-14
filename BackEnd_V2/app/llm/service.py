from functools import lru_cache
from app.llm.models import (
    LLMRefineGoalRequest,
    LLMRefineGoalResponse,
    LLMSendMessageRequest,
    LLMSendMessageResponse,
)
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import LLMProvider
from app.llm.exceptions import LLMConfigurationError
from app.schemas.goals import UnderstandGoalRequest
from app.schemas.chat import SendMessageRequest
from app.llm.providers import (
    ClaudeProvider,
    GeminiProvider,
    OllamaProvider,
    OpenAIProvider,
)


class LLMService:
    def __init__(
        self,
        settings: LLMSettings | None = None,
        provider: BaseLLMProvider | None = None,
    ) -> None:
        self._settings = settings or llm_settings
        self._provider = provider or self._build_provider(self._settings)

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
    ) -> LLMRefineGoalResponse:

        request = LLMRefineGoalRequest(request_data=request_data, user_id=user_id)
        response = await self._provider.refine_goal(request)

        if response is None or response.refined_data is None:
            raise LLMConfigurationError(
                "LLM provider returned no refined data for the goal."
            )

        return response

    async def create_conversation(
        self,
        data: SendMessageRequest,
        user_id: int | None = None,
    ) -> LLMSendMessageResponse:
        request = LLMSendMessageRequest(
            agent_description="",
            user_content=data.content,
            user_id=user_id,
        )
        pass

    async def health_check(self) -> bool:
        return await self._provider.health_check()

    async def close(self) -> None:
        await self._provider.close()


@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    return LLMService()
