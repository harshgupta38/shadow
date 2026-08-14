from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.services import chat_service
from app.schemas.chat import (
    ConversationDataList,
    MessageChunk,
    SendMessageRequest,
)
from app.llm import LLMSendMessageResponse

router = APIRouter(prefix=ENDPOINTS.CHAT.PREFIX, tags=["Chat"])


@router.get(ENDPOINTS.CHAT.CONVERSATIONS, response_model=list[ConversationDataList])
def conversation_list(
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationDataList]:
    return chat_service.conversation_list(db, current_user)


@router.post(
    ENDPOINTS.CHAT.NEW_MESSAGE,
    response_model=LLMSendMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    data: SendMessageRequest,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LLMSendMessageResponse:
    return await chat_service.create_conversation(db, current_user, data)


@router.get(ENDPOINTS.CHAT.MESSAGES, response_model=MessageChunk)
def get_message_chunk(
    conversation_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    before_message_id: int | None = None,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageChunk:
    return chat_service.get_message_chunk(db, current_user, conversation_id, limit, before_message_id)