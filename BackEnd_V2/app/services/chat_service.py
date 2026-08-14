from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.llm import get_llm_service, LLMSendMessageResponse, LLMError, LLMRequestError
from app.models.user import User
from app.models.chat import Conversation, Message
from app.schemas.chat import (
    ConversationData,
    ConversationDataList,
    MessageChunk,
    MessageData,
    MessageRoleEnum,
    SendMessageRequest,
)


def _serialize_conversation(conversation: Conversation) -> ConversationDataList:
    return ConversationDataList.model_validate(conversation)


def _serialize_message(message: Message) -> MessageData:
    return MessageData.model_validate(message)


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
        title=response.llm_data.title,
        agent_type=data.agent_type,
        stable_context=response.llm_data.stable_context,
        context_summary=response.llm_data.context_summary,
        linked_items={},
    )
    db.add(conversation)
    db.flush()

    user_message = Message(
        conversation_id=conversation.id,
        role=MessageRoleEnum.USER,
        content=data.content,
    )
    db.add(user_message)

    assistant_message = Message(
        conversation_id=conversation.id,
        role=MessageRoleEnum.ASSISTANT,
        content=response.llm_data.content,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(conversation)
    db.refresh(assistant_message)

    message_data = MessageData(
        id=assistant_message.id,
        conversation_id=conversation.id,
        content=assistant_message.content,
        role=MessageRoleEnum.ASSISTANT,
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


def get_message_chunk(
    db: Session,
    current_user: User,
    conversation_id: int,
    limit: int,
    before_message_id: int | None,
) -> MessageChunk:
    conversation = db.get(Conversation, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    query = select(Message).where(Message.conversation_id == conversation_id)
    if before_message_id is not None:
        query = query.where(Message.id < before_message_id)

    messages = list(
        db.scalars(query.order_by(Message.id.desc()).limit(limit + 1)).all()
    )
    has_more = len(messages) > limit
    message_list = messages[:limit]
    message_list.reverse()

    return MessageChunk(
        message_list=[_serialize_message(message) for message in message_list],
        has_more=has_more,
    )


def delete_conversation(db: Session, current_user: User, conversation_id: int) -> None:
    conversation = db.get(Conversation, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    db.execute(delete(Message).where(Message.conversation_id == conversation_id))
    db.delete(conversation)
    db.commit()