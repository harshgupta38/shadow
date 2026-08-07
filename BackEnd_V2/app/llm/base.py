from abc import ABC, abstractmethod


class BaseLLMProvider(ABC):
    @abstractmethod
    async def health_check(self) -> bool:
        raise NotImplementedError

    async def close(self) -> None:
        return None
