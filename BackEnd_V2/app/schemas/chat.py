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
    content: str
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


class MessageFromLLMSchema(BaseModel):
    content: str = Field(description="The assistant's response to the user's message.")
    stable_context: str | None = Field(
        default=None,
        description="Optional. Include only new durable facts or intent when the persistent stable context genuinely needs to be updated. Otherwise omit this field or return null. Do not rewrite or repeat the existing stable context.",
    )
    context_summary: str | None = Field(
        default=None,
        description="Optional rolling summary of the latest conversation. Keep it concise and update it frequently as the user's conversation develops. Omit this field or return null only when no summary update is needed.",
    )
    stable_context_action: Literal["none", "append", "replace"] = Field(
        default="none",
        description="How to handle stable_context. Use 'none' when stable_context is omitted or null, 'append' only for new durable facts that should be added to the existing context, and 'replace' only when the existing context is incorrect or needs a complete rewrite.",
    )
    context_summary_action: Literal["none", "append", "replace"] = Field(
        default="none",
        description="How to handle context_summary. Use 'none' when context_summary is omitted or null, 'append' for an intentional addition to the existing summary, and 'replace' when refreshing the rolling summary to reflect the latest conversation.",
    )
