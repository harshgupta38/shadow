from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from typing import Literal

from app.schemas.common import ORMModel

AssistantAgentType = Literal["shadow", "goal_coach", "career_advisor", "insights"]
MessageRole = Literal["user", "assistant"]


# list of conversations for a user
class ConversationDataList(ORMModel):
    id: int
    title: str
    agent_type: str

    created_at: datetime
    updated_at: datetime


# details of a conversation
class ConversationData(ORMModel):
    id: int
    user_id: int
    title: str
    agent_type: AssistantAgentType

    stable_context: str
    context_summary: str
    linked_items: dict

    created_at: datetime
    updated_at: datetime


# request to start a new conversation
class SendMessageRequest(BaseModel):
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
class MessageData(BaseModel):
    id: int
    conversation_id: int
    content: str
    role: MessageRole
    created_at: datetime

# internal class to send object to LLM service for new conversation
class NewConversationRequestInternal(BaseModel):
    agent_type: AssistantAgentType
    agent_description: str
    user_content: str

class NewConversationResponseInternal(BaseModel):
    title: str
    