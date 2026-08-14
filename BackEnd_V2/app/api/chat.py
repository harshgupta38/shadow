from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.services import chat_service
from app.schemas.chat import (
    ConversationDataList,
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
