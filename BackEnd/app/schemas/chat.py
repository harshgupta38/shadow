"""Chat schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import AgentType, ChatRole
from app.schemas.common import ORMModel


class ChatSessionCreate(BaseModel):
    agent_type: AgentType = AgentType.general
    title: str = Field(default="New chat", max_length=255)


class ChatSessionRead(ORMModel):
    id: int
    agent_type: AgentType
    title: str
    created_at: datetime
    updated_at: datetime


class ChatMessageRead(ORMModel):
    id: int
    session_id: int
    role: ChatRole
    content: str
    agent_type: AgentType
    created_at: datetime


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1)


class ChatSendResponse(BaseModel):
    """A user message and the assistant reply it produced."""

    user_message: ChatMessageRead
    assistant_message: ChatMessageRead
