from enum import Enum, StrEnum


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


class Role(StrEnum):
    # Normalized message roles used in ChatMessage/ChatRequest.
    # These roles are provider-agnostic and later translated by providers
    # into the payload format expected by each LLM API.
    """Normalized chat roles used by provider-independent request models."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class OllamaModel(StrEnum):
    BASE_URL = "http://localhost:11434/v1"

    # Qwen
    QWEN3_4B = "qwen3:4b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    QWEN3_8B = "qwen3:8b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    QWEN3_14B = "qwen3:14b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    QWEN3_30B = "qwen3:30b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)

    # Gemma
    GEMMA3_1B = "gemma3:1b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    GEMMA3_4B = "gemma3:4b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    GEMMA3_12B = "gemma3:12b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    GEMMA3_27B = "gemma3:27b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)

    # Llama
    LLAMA3_2_1B = "llama3.2:1b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    LLAMA3_2_3B = "llama3.2:3b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)

    # DeepSeek
    DEEPSEEK_R1_7B = "deepseek-r1:7b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)
    DEEPSEEK_R1_8B = "deepseek-r1:8b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)

    # Mistral
    MISTRAL_7B = "mistral:7b"  # Cost: approx. INR 0 input / INR 0 output per 1K tokens (runs locally)


class OpenAIModel(StrEnum):
    GPT_5 = "gpt-5"  # Cost: approx. INR 0.11 input / INR 0.88 output per 1K tokens
    GPT_5_MINI = "gpt-5-mini"  # Cost: approx. INR 0.022 input / INR 0.176 output per 1K tokens
    GPT_5_NANO = "gpt-5-nano"  # Cost: approx. INR 0.0044 input / INR 0.035 output per 1K tokens

    GPT_4_1 = "gpt-4.1"  # Cost: approx. INR 0.176 input / INR 0.704 output per 1K tokens
    GPT_4_1_MINI = "gpt-4.1-mini"  # Cost: approx. INR 0.035 input / INR 0.141 output per 1K tokens
    GPT_4_1_NANO = "gpt-4.1-nano"  # Cost: approx. INR 0.009 input / INR 0.035 output per 1K tokens

    O4_MINI = "o4-mini"  # Cost: approx. INR 0.097 input / INR 0.387 output per 1K tokens

    GPT_5_6_SOL = "gpt-5.6-sol"  # Cost: approx. INR 0.47 input / INR 2.82 output per 1K tokens
    GPT_5_6_TERRA = "gpt-5.6-terra"  # Cost: approx. INR 0.19 input / INR 1.13 output per 1K tokens
    GPT_5_6_LUNA = "gpt-5.6-luna"  # Cost: approx. INR 0.019 input / INR 0.113 output per 1K tokens


class GeminiModel(StrEnum):
    # ===== Gemini 3.6 =====
    GEMINI_3_6_FLASH = "gemini-3.6-flash"  # Cost: approx. INR 0.026 input / INR 0.21 output per 1K tokens

    # ===== Gemini 3.5 =====
    GEMINI_3_5_FLASH = "gemini-3.5-flash"  # Cost: approx. INR 0.026 input / INR 0.21 output per 1K tokens
    GEMINI_3_5_FLASH_LITE = "gemini-3.5-flash-lite"  # Cost: approx. INR 0.009 input / INR 0.07 output per 1K tokens

    # ===== Gemini 3.1 =====
    GEMINI_3_1_FLASH_LITE = "gemini-3.1-flash-lite"  # Cost: approx. INR 0.009 input / INR 0.07 output per 1K tokens

    # ===== Gemini 2.5 =====
    GEMINI_2_5_PRO = "gemini-2.5-pro"  # Cost: approx. INR 0.11 input / INR 0.88 output per 1K tokens
    GEMINI_2_5_FLASH = "gemini-2.5-flash"  # Cost: approx. INR 0.026 input / INR 0.21 output per 1K tokens
    GEMINI_2_5_FLASH_LITE = "gemini-2.5-flash-lite"  # Cost: approx. INR 0.009 input / INR 0.07 output per 1K tokens

    # ===== Latest aliases =====
    GEMINI_FLASH_LATEST = "gemini-flash-latest"  # Cost: same as the underlying Gemini Flash model
    GEMINI_PRO_LATEST = "gemini-pro-latest"  # Cost: same as the underlying Gemini Pro model


class ClaudeModel(StrEnum):
    # ===== Claude 5 =====
    CLAUDE_FABLE_5 = "claude-fable-5"  # Cost: pricing not publicly listed yet
    CLAUDE_OPUS_5 = "claude-opus-5"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens
    CLAUDE_SONNET_5 = "claude-sonnet-5"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens

    # ===== Claude 4 =====
    CLAUDE_OPUS_4_8 = "claude-opus-4-8"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens
    CLAUDE_OPUS_4_7 = "claude-opus-4-7"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens
    CLAUDE_OPUS_4_6 = "claude-opus-4-6"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens
    CLAUDE_OPUS_4_5 = "claude-opus-4-5"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens
    CLAUDE_OPUS_4_1 = "claude-opus-4-1"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens
    CLAUDE_OPUS_4 = "claude-opus-4"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens

    CLAUDE_SONNET_4_6 = "claude-sonnet-4-6"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens
    CLAUDE_SONNET_4_5 = "claude-sonnet-4-5"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens
    CLAUDE_SONNET_4_1 = "claude-sonnet-4-1"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens
    CLAUDE_SONNET_4 = "claude-sonnet-4"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens

    CLAUDE_HAIKU_4_5 = "claude-haiku-4-5"  # Cost: approx. INR 0.07 input / INR 0.35 output per 1K tokens

    # ===== Claude 3.x =====
    CLAUDE_SONNET_3_7 = "claude-3-7-sonnet"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens

    CLAUDE_SONNET_3_5 = "claude-3-5-sonnet"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens
    CLAUDE_HAIKU_3_5 = "claude-3-5-haiku"  # Cost: approx. INR 0.07 input / INR 0.35 output per 1K tokens

    # ===== Claude 3 =====
    CLAUDE_OPUS_3 = "claude-3-opus"  # Cost: approx. INR 1.32 input / INR 6.60 output per 1K tokens
    CLAUDE_SONNET_3 = "claude-3-sonnet"  # Cost: approx. INR 0.264 input / INR 1.32 output per 1K tokens
    CLAUDE_HAIKU_3 = "claude-3-haiku"  # Cost: approx. INR 0.022 input / INR 0.11 output per 1K tokens


class LLMModel:
    OLLAMA = OllamaModel
    OPENAI = OpenAIModel
    GEMINI = GeminiModel
    CLAUDE = ClaudeModel


ModelKey = OllamaModel | OpenAIModel | GeminiModel | ClaudeModel