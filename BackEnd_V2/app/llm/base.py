from abc import ABC, abstractmethod

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
)


class BaseLLMProvider(ABC):
    @abstractmethod
    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def generate_milestone_proposals(self, request: MilestoneProposalsToLLM) -> MilestoneProposalsFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def generate_task_proposals(self, request: TaskProposalsToLLM) -> TaskProposalsFromLLM:
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
