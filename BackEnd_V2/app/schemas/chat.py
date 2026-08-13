from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.llm.enums import Role
from app.schemas.common import ORMModel


class ConversationCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class ConversationRead(ORMModel):
    id: int
    title: str | None
    context_summary: str
    created_at: datetime
    updated_at: datetime


class ChatSendRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)

    @field_validator("content", mode="before")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("Message content is required.")
            return stripped
        return value


class ChatMessageRead(ORMModel):
    id: int
    conversation_id: int
    role: Role
    content: str
    created_at: datetime


class ChatMessagePage(BaseModel):
    items: list[ChatMessageRead]
    limit: int
    before_message_id: int | None
    has_more: bool


class ChatSendResponse(BaseModel):
    conversation_id: int
    message: ChatMessageRead
    summary_updated: bool = False
