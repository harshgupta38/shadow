from sqlalchemy import select
from sqlalchemy.orm import Session

from app.llm import get_llm_service, LLMSendMessageResponse, LLMError, LLMRequestError
from app.models.user import User
from app.models.chat import Conversation, Message
from app.schemas.chat import (
    ConversationData,
    ConversationDataList,
    MessageData,
    SendMessageRequest,
)


def _serialize_conversation(conversation: Conversation) -> ConversationDataList:
    return ConversationDataList.model_validate(conversation)


def conversation_list(db: Session, current_user: User) -> list[ConversationDataList]:
    conversations = list(
        db.scalars(
            select(Conversation)
            .where(Conversation.user_id == current_user.id)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        ).all()
    )
    return [_serialize_conversation(conversation) for conversation in conversations]


async def create_conversation(
    db: Session,
    current_user: User,
    data: SendMessageRequest,
) -> LLMSendMessageResponse:
    llm_service = get_llm_service()

    try:
        response = await llm_service.create_conversation(data, user_id=current_user.id)
    except LLMError as exc:
        raise LLMRequestError(f"Failed to create conversation: {exc}") from exc

    conversation = Conversation(
        user_id=current_user.id,
        title=response.conversation_data.title,
        agent_type=data.agent_type,

        stable_context=response.conversation_data.stable_context,
        context_summary=response.conversation_data.context_summary,
        linked_items=response.conversation_data.linked_items,
    )
    db.add(conversation)
    db.flush()

    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=data.content,
    )
    db.add(user_message)

    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=response.message_data.content,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(conversation)
    db.refresh(assistant_message)

    message_data = MessageData(
        id=assistant_message.id,
        conversation_id=conversation.id,
        content=assistant_message.content,
        role="assistant",
        created_at=assistant_message.created_at,
    )

    conversation_data = ConversationData(
        id=conversation.id,
        user_id=conversation.user_id,
        title=conversation.title,
        agent_type=conversation.agent_type,

        stable_context=conversation.stable_context,
        context_summary=conversation.context_summary,
        linked_items=conversation.linked_items,

        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )

    return LLMSendMessageResponse(
        message_data=message_data,
        conversation_data=conversation_data,

        provider=response.provider,
        model=response.model,
        model_str=response.model_str,
        finish_reason=response.finish_reason,
        usage=response.usage,
        response_id=response.response_id,
        response_time_ms=response.response_time_ms,
        cost=response.cost,
    )
