from abc import ABC, abstractmethod


class BaseLLMProvider(ABC):
    # These methods are kept for future LLM use cases like streaming and health checks.
    # @abstractmethod
    # async def chat(self, request: ChatRequest) -> ChatResponse:
    #     raise NotImplementedError

    # These methods are kept for future LLM use cases like streaming and health checks.
    # @abstractmethod
    # async def stream_chat(self, request: ChatRequest) -> AsyncIterator[str]:
    #     raise NotImplementedError

    @abstractmethod
    async def health_check(self) -> bool:
        raise NotImplementedError

    async def close(self) -> None:
        return None
