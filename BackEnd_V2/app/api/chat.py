from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.services import chat_service
from app.schemas.chat import (
    ConvoDataShortResponse,
    MessageChunkResponse,
    NewConvoRequest,
    MessageRequest,
)
from app.llm import NewConvoResponse, MessageResponse

router = APIRouter(prefix=ENDPOINTS.CHAT.PREFIX, tags=["Chat"])


@router.get(ENDPOINTS.CHAT.CONVERSATIONS, response_model=list[ConvoDataShortResponse])
def conversation_list(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[ConvoDataShortResponse]:
    return chat_service.conversation_list(db, current_user)


@router.post(
    ENDPOINTS.CHAT.NEW_MESSAGE,
    response_model=NewConvoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    data: NewConvoRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> NewConvoResponse:
    return await chat_service.create_conversation(db, current_user, data)


@router.get(ENDPOINTS.CHAT.MESSAGES, response_model=MessageChunkResponse)
def get_message_chunk(
    conversation_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    before_message_id: int | None = None,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> MessageChunkResponse:
    return chat_service.get_message_chunk(db, current_user, conversation_id, limit, before_message_id)


@router.delete(ENDPOINTS.CHAT.CONVERSATION_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    chat_service.delete_conversation(db, current_user, conversation_id)


@router.post(ENDPOINTS.CHAT.MESSAGES, response_model=MessageResponse)
async def respond_to_message(
    conversation_id: int,
    data: MessageRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> MessageResponse:
    return await chat_service.respond_to_message(db, current_user, conversation_id, data)