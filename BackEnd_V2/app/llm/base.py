from abc import ABC, abstractmethod

from app.llm.models import (
    RefineGoalToLLM,
    RefineGoalFromLLM,
    NewConvoToLLM,
    NewConvoFromLLM,
)


class BaseLLMProvider(ABC):
    @abstractmethod
    async def refine_goal(self, request: RefineGoalToLLM) -> RefineGoalFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def create_conversation(self, request: NewConvoToLLM) -> NewConvoFromLLM:
        raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> bool:
        raise NotImplementedError

    async def close(self) -> None:
        return None
