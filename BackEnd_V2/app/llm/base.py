from abc import ABC, abstractmethod

from app.llm.models import RefineGoalResponse, RefineGoalRequest, ChatRequest, ChatResponse


class BaseLLMProvider(ABC):
    @abstractmethod
    async def refine_goal(self, request: RefineGoalRequest) -> RefineGoalResponse:
        raise NotImplementedError
    
    @abstractmethod
    async def chat(self, request: ChatRequest) -> ChatResponse:
        raise NotImplementedError
    
    @abstractmethod
    async def health_check(self) -> bool:
        raise NotImplementedError

    async def close(self) -> None:
        return None
