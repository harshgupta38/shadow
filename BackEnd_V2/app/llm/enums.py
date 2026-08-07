from enum import StrEnum


class LLMProvider(StrEnum):
    # Canonical provider names used across the app.
    # `LLMSettings.llm_provider` reads one of these values from .env,
    # then LLMService maps it to the concrete provider class.
    """Supported LLM providers configured through environment variables."""

    OLLAMA = "ollama"
    OPENAI = "openai"
    GEMINI = "gemini"
    CLAUDE = "claude"
    AZURE_OPENAI = "azure_openai"


class ChatRole(StrEnum):
    # Normalized message roles used in ChatMessage/ChatRequest.
    # These roles are provider-agnostic and later translated by providers
    # into the payload format expected by each LLM API.
    """Normalized chat roles used by provider-independent request models."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
