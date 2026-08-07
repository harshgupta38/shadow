from pydantic import BaseModel, Field

from app.llm.enums import ChatRole, LLMProvider


# Provider-agnostic DTOs for the LLM module.
# Why:
# - Provide one stable request/response shape independent of provider APIs.
# - Validate inputs early (required messages/content and numeric constraints).
# - Allow providers to translate to/from vendor-specific payloads.
class ChatMessage(BaseModel):
    """Provider-agnostic chat message."""

    role: ChatRole
    content: str = Field(min_length=1)
    name: str | None = None


class ChatRequest(BaseModel):
    """Unified request model for chat-style text generation."""

    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, gt=0)


class TokenUsage(BaseModel):
    """Token accounting returned by compatible providers."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class ChatResponse(BaseModel):
    """Provider-agnostic chat response payload."""

    provider: LLMProvider
    model: str
    message: ChatMessage
    finish_reason: str | None = None
    usage: TokenUsage | None = None
    response_id: str | None = None
