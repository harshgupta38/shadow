from datetime import datetime
from enum import StrEnum
from pydantic import BaseModel, Field, field_validator
from typing import Literal

from app.schemas.common import ORMModel

AssistantAgentType = Literal["shadow", "goal_coach", "career_advisor", "insights"]


class MessageRoleEnum(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"


# list of conversations for a user
class ConvoDataShortDBS(ORMModel):
    id: int
    title: str
    agent_type: str

    created_at: datetime
    updated_at: datetime


class ConvoDataShortResponse(ConvoDataShortDBS):
    pass


# details of a conversation
class ConvoDataLongDBS(ORMModel):
    id: int
    user_id: int
    title: str
    agent_type: AssistantAgentType

    stable_context: str
    context_summary: str
    summary_user_message_count: int
    linked_items: dict

    created_at: datetime
    updated_at: datetime


class ConvoDataResponse(ConvoDataLongDBS):
    pass


# request to start a new conversation
class NewConvoRequest(BaseModel):
    conversation_id: int
    content: str = Field(min_length=1)
    agent_type: AssistantAgentType

    @field_validator("content", mode="before")
    def validate_content(cls, v):
        if not v or not v.strip():
            raise ValueError("Message cannot be empty")
        return v

    @field_validator("agent_type", mode="before")
    def validate_agent_type(cls, v):
        valid_agent_types = ["shadow", "goal_coach", "career_advisor", "insights"]
        if v not in valid_agent_types:
            raise ValueError(f"Invalid agent type.")
        return v


# each message response structure
class MessageDataDBS(ORMModel):
    id: int
    conversation_id: int
    role: MessageRoleEnum
    content: list[str]
    created_at: datetime


class MessageDataResponse(MessageDataDBS):
    pass


class MessageChunkResponse(BaseModel):
    message_list: list[MessageDataResponse]
    has_more: bool


# internal schema: what the LLM must return for a new conversation
class NewConvoFromLLMSchema(BaseModel):
    title: str = Field(
        description="A 1-3 word title that captures the core topic of this conversation."
    )
    content: str = Field(
        description="The assistant's first message in the conversation."
    )

    stable_context: str = Field(
        description="The core facts and intent extracted from the user's first message. This is the persistent context of the conversation — it will not be updated often."
    )
    context_summary: str = Field(
        description="A concise summary of what has happened so far in the conversation."
    )


class MessageRequest(BaseModel):
    content: str = Field(min_length=1)

    @field_validator("content", mode="before")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("Message is required.")
            return stripped
        return value


class RenameConvoRequest(BaseModel):
    title: str = Field(min_length=1, max_length=30)

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: str) -> str:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("Title is required.")
            return stripped
        return value


class MessageFromLLMSchema(BaseModel):
    content: str = Field(description="The assistant's response to the user's message.")


class ConversationContextFromLLMSchema(BaseModel):
    context_summary: str = Field(
        description="A concise factual summary of the conversation history up to and including the current user message. Preserve decisions, relevant user information, direction, and unresolved tasks. Do not invent information or include filler."
    )
    stable_context: str | None = Field(
        default=None,
        description="Updated durable facts, intent, preferences, decisions, or constraints only when genuinely new persistent information exists. Otherwise return null. Preserve existing durable information."
    )
