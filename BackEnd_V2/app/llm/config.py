from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.llm.enums import ClaudeModel, GeminiModel, LLMProvider, LLMModel, OpenAIModel


class LLMSettings(BaseSettings):
    # Default system prompt prepended to every LLM request.
    llm_system_prompt: str = Field(
        default="""
You are Shadow, an AI personal assistant.

Your purpose is to help the user organize life, achieve goals, make decisions, and complete tasks.

Rules:
- Always respond in English.
- Be concise, accurate, and actionable.
- Ask clarifying questions when required.
- Never invent facts. If information is missing, say so.
- Use the provided context as the source of truth.
- If context conflicts with user input, ask for clarification instead of assuming.
- Format responses for readability using Markdown when helpful.
""",
        alias="LLM_SYSTEM_PROMPT",
        min_length=1,
    )

    # Active provider used by the LLM service.
    llm_provider: LLMProvider = Field(
        default=LLMProvider.OLLAMA,
        alias="LLM_PROVIDER",
    )

    # Base URL for the Ollama OpenAI-compatible endpoint.
    ollama_base_url: str = Field(
        default=LLMModel.OLLAMA.BASE_URL,
        alias="OLLAMA_BASE_URL",
    )

    # Default model name requested from Ollama.
    ollama_model: str = Field(
        default=LLMModel.OLLAMA.QWEN3_4B,
        alias="OLLAMA_MODEL",
    )

    # API key sent to the Ollama-compatible client.
    ollama_api_key: str = Field(
        default=LLMProvider.OLLAMA,
        alias="OLLAMA_API_KEY",
    )

    # Timeout in seconds for each LLM request.
    llm_request_timeout_seconds: int = Field(
        default=600,
        alias="LLM_REQUEST_TIMEOUT_SECONDS",
        ge=1,
        le=3600,
    )

    chat_recent_message_limit: int = Field(
        default=12,
        alias="CHAT_RECENT_MESSAGE_LIMIT",
        ge=1,
        le=100,
    )

    chat_summary_update_user_messages: int = Field(
        default=10,
        alias="CHAT_SUMMARY_UPDATE_USER_MESSAGES",
        ge=1,
        le=100,
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
    )

    openai_api_key: str = Field(
        default="",
        alias="OPENAI_API_KEY",
    )

    openai_model: OpenAIModel = Field(
        default=LLMModel.OPENAI.GPT_5_MINI,
        alias="OPENAI_MODEL",
    )

    gemini_api_key: str = Field(
        default="",
        alias="GEMINI_API_KEY",
    )

    gemini_model: GeminiModel = Field(
        default=LLMModel.GEMINI.GEMINI_2_5_FLASH,
        alias="GEMINI_MODEL",
    )

    claude_api_key: str = Field(
        default="",
        alias="CLAUDE_API_KEY",
    )

    claude_model: ClaudeModel = Field(
        default=LLMModel.CLAUDE.CLAUDE_SONNET_3_7,
        alias="CLAUDE_MODEL",
    )


# Create one ready-to-use settings object at import time.
# Services read this object to configure provider/model/system prompt/timeout.
llm_settings = LLMSettings()
