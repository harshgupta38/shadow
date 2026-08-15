from abc import ABC, abstractmethod

from app.llm.models import (
    RefineGoalToLLM,
    RefineGoalFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
    MessageToLLM,
    MessageFromLLM,
    ConversationContextToLLM,
    ConversationContextFromLLM,
)


class BaseLLMProvider(ABC):
    @abstractmethod
    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def create_conversation(self, request: NewConvoToLLM) -> NewConvoFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def respond_to_message(self, request: MessageToLLM) -> MessageFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def update_conversation_context(self, request: ConversationContextToLLM) -> ConversationContextFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        return None
