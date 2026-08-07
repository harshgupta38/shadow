from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.llm.enums import LLMProvider


class LLMSettings(BaseSettings):
    # Central LLM configuration loaded from environment variables / .env.
    # How it works:
    # - Each field has an `alias` (the env var name to read, e.g. LLM_PROVIDER).
    # - If env var is missing, the `default` value is used.
    # - Pydantic validates values (URL format, ranges, min_length, enum values).
    # - `model_config` controls loading behavior (.env file, case-insensitive keys, ignore extras).
    """Configuration for provider selection and provider-specific clients."""

    llm_system_prompt: str = Field(
        default=(
            "You are Jarvis, the AI assistant of this application.\n\n"
            "Always respond in English.\n\n"
            "Never respond in Chinese or any other language unless the user "
            "explicitly asks you to.\n\n"
            "Keep responses concise and helpful."
        ),
        alias="LLM_SYSTEM_PROMPT",
        min_length=1,
    )

    llm_provider: LLMProvider = Field(
        default=LLMProvider.OLLAMA,
        alias="LLM_PROVIDER",
    )

    ollama_base_url: AnyHttpUrl = Field(
        default="http://localhost:11434/v1",
        alias="OLLAMA_BASE_URL",
    )
    ollama_model: str = Field(
        default="qwen3:4b",
        alias="OLLAMA_MODEL",
    )
    ollama_api_key: str = Field(
        default="ollama",
        alias="OLLAMA_API_KEY",
    )

    llm_request_timeout_seconds: float = Field(
        default=120.0,
        alias="LLM_REQUEST_TIMEOUT_SECONDS",
        ge=1.0,
        le=600.0,
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
        case_sensitive=False,
    )


# Create one ready-to-use settings object at import time.
# Services read this object to configure provider/model/system prompt/timeout.
llm_settings = LLMSettings()
