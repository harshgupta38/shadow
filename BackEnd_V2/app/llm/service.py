from functools import lru_cache
from typing import Callable

from app.llm.models import (
    RefineGoalToLLM,
    RefineGoalFromLLM,
    MilestoneProposalsToLLM,
    MilestoneProposalsFromLLM,
    TaskProposalsToLLM,
    TaskProposalsFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    MessageToLLM,
    MessageFromLLM,
    ConversationContextToLLM,
    ConversationContextFromLLM,
    ExtractUserMemoryToLLM,
    ExtractUserMemoryFromLLM,
)
from app.llm.base import BaseLLMProvider
from app.llm.config import LLMSettings, llm_settings
from app.llm.enums import LLMProvider
from app.llm.exceptions import LLMConfigurationError
from app.schemas.goals import RefineGoalRequest
from app.schemas.chat import MessageRequest, NewConvoRequest
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
        request_data: RefineGoalRequest,
        user_id: int,
    ) -> RefineGoalFromLLM:

        request = RefineGoalToLLM(request_data=request_data, user_id=user_id)
        response = await self._provider.refine_goal(request)

        if response is None or response.refined_data is None:
            raise LLMConfigurationError(
                "LLM provider returned no refined data for the goal."
            )

        return response

    async def generate_milestone_proposals(
        self,
        goal_data: dict,
        user_id: int,
    ) -> MilestoneProposalsFromLLM:
        request = MilestoneProposalsToLLM(goal_data=goal_data, user_id=user_id)
        response = await self._provider.generate_milestone_proposals(request)

        if response is None or response.proposals is None:
            raise LLMConfigurationError("LLM provider returned no milestone proposals.")

        return response

    async def generate_task_proposals(
        self,
        goal_data: dict,
        milestone_data: dict,
        user_id: int,
    ) -> TaskProposalsFromLLM:
        request = TaskProposalsToLLM(goal_data=goal_data, milestone_data=milestone_data, user_id=user_id)
        response = await self._provider.generate_task_proposals(request)

        if response is None or response.proposals is None:
            raise LLMConfigurationError("LLM provider returned no task proposals.")

        return response

    async def create_conversation(
        self,
        data: NewConvoRequest,
        user_id: int,
        goal_id: int | None = None,
        milestone_id: int | None = None,
        tool_executor: Callable[[str, dict], dict] | None = None,
        user_memory: str = "",
    ) -> NewConvoFromLLM:
        request = NewConvoToLLM(
            request_data=data,
            user_id=user_id,
            goal_id=goal_id,
            milestone_id=milestone_id,
            tool_executor=tool_executor,
            user_memory=user_memory,
        )
        response = await self._provider.create_conversation(request)

        if response is None or response.llm_data is None:
            raise LLMConfigurationError("LLM provider returned no conversation data.")

        return response

    async def respond_to_message(
        self,
        data: MessageRequest,
        stable_context: str,
        context_summary: str,
        agent_type: str,
        recent_messages: list[dict[str, str]],
        user_id: int,
        goal_id: int | None = None,
        milestone_id: int | None = None,
        tool_executor: Callable[[str, dict], dict] | None = None,
        user_memory: str = "",
    ) -> MessageFromLLM:
        request = MessageToLLM(
            request_data=data.content,
            user_id=user_id,
            goal_id=goal_id,
            milestone_id=milestone_id,
            agent_type=agent_type,
            stable_context=stable_context,
            context_summary=context_summary,
            recent_messages=recent_messages,
            tool_executor=tool_executor,
            user_memory=user_memory,
        )
        response = await self._provider.respond_to_message(request)

        if response is None or response.llm_data is None:
            raise LLMConfigurationError("LLM provider returned no message data.")

        return response

    async def extract_user_memory(
        self,
        user_id: int,
        agent_type: str,
        stable_context: str,
        context_summary: str,
        messages: list[dict[str, str]],
        existing_memories: list[dict],
    ) -> ExtractUserMemoryFromLLM:
        request = ExtractUserMemoryToLLM(
            user_id=user_id,
            agent_type=agent_type,
            stable_context=stable_context,
            context_summary=context_summary,
            messages=messages,
            existing_memories=existing_memories,
        )
        response = await self._provider.extract_user_memory(request)

        if response is None or response.llm_data is None:
            raise LLMConfigurationError("LLM provider returned no memory extraction data.")

        return response

    async def update_conversation_context(
        self,
        stable_context: str,
        context_summary: str,
        agent_type: str,
        messages: list[dict[str, str]],
        user_id: int,
    ) -> ConversationContextFromLLM:
        request = ConversationContextToLLM(
            user_id=user_id,
            agent_type=agent_type,
            stable_context=stable_context,
            context_summary=context_summary,
            messages=messages,
        )
        response = await self._provider.update_conversation_context(request)

        if response is None or response.llm_data is None:
            raise LLMConfigurationError(
                "LLM provider returned no conversation context data."
            )

        return response

    async def health_check(self) -> bool:
        return await self._provider.health_check()

    async def close(self) -> None:
        await self._provider.close()


@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    return LLMService()
