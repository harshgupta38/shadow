from abc import ABC, abstractmethod

from app.llm.models import (
    LLMRefineGoalRequest,
    LLMRefineGoalResponse,
    LLMSendMessageRequest,
    LLMCreateConversationDraft,
)


class BaseLLMProvider(ABC):
    @abstractmethod
    async def refine_goal(self, request: LLMRefineGoalRequest) -> LLMRefineGoalResponse:
        raise NotImplementedError

    @abstractmethod
    async def create_conversation(self, request: LLMSendMessageRequest) -> LLMCreateConversationDraft:
        raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> bool:
        raise NotImplementedError

    async def close(self) -> None:
        return None
