from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import (
    ChatMessagePage,
    ChatSendRequest,
    ChatSendResponse,
    ConversationCreateRequest,
    ConversationRead,
)
from app.services import chat_service

router = APIRouter(prefix=ENDPOINTS.CHAT.PREFIX, tags=["Chat"])


@router.post(ENDPOINTS.CHAT.CONVERSATIONS, response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def create_conversation(
    data: ConversationCreateRequest,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationRead:
    return chat_service.create_conversation(db, current_user, data)


@router.get(ENDPOINTS.CHAT.CONVERSATIONS, response_model=list[ConversationRead])
def list_conversations(
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationRead]:
    return chat_service.list_conversations(db, current_user)


@router.get(ENDPOINTS.CHAT.CONVERSATION_DETAIL, response_model=ConversationRead)
def get_conversation(
    conversation_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationRead:
    return chat_service.get_conversation(db, current_user, conversation_id)


@router.delete(ENDPOINTS.CHAT.CONVERSATION_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    chat_service.delete_conversation(db, current_user, conversation_id)


@router.get(ENDPOINTS.CHAT.MESSAGES, response_model=ChatMessagePage)
def get_messages(
    conversation_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    before_message_id: int | None = None,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatMessagePage:
    return chat_service.get_messages(db, current_user, conversation_id, limit, before_message_id)


@router.post(ENDPOINTS.CHAT.MESSAGES, response_model=ChatSendResponse)
async def send_message(
    conversation_id: int,
    data: ChatSendRequest,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatSendResponse:
    return await chat_service.send_message(db, current_user, conversation_id, data)