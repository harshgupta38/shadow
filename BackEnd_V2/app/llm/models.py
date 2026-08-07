from pydantic import BaseModel

# class ChatMessage(BaseModel):
#     role: Role
#     content: str = Field(min_length=1)
#     name: str | None = None

#     @field_validator("content")
#     @classmethod
#     def validate_content(cls, value: str) -> str:
#         if not value.strip():
#             raise ValueError("Message content is required.")
#         return value


# class ChatRequest(BaseModel):
#     messages: list[ChatMessage] = Field(min_length=1)
#     model: str | None = None
#     temperature: float | None = Field(default=None, ge=0.0, le=2.0)
#     max_tokens: int | None = Field(default=None, gt=0)


class TokenUsage(BaseModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


# class ChatResponse(BaseModel):
#     provider: str
#     model: str
#     message: ChatMessage
#     finish_reason: str | None = None
#     usage: TokenUsage | None = None
#     response_id: str | None = None
