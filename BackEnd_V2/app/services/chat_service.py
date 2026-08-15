from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.llm.models import MessageResponse
from app.llm.config import llm_settings
from app.core.exceptions import NotFoundError
from app.llm import get_llm_service, NewConvoResponse, LLMError, LLMRequestError
from app.models.user import UserDBM
from app.models.chat import ConversationDBM, MessageDBM
from app.schemas.chat import (
    ConvoDataResponse,
    ConvoDataShortResponse,
    MessageChunkResponse,
    MessageDataResponse,
    MessageRequest,
    MessageRoleEnum,
    NewConvoRequest,
)


def _serialize_conversation(conversation: ConversationDBM) -> ConvoDataShortResponse:
    return ConvoDataShortResponse.model_validate(conversation)


def _serialize_message(message: MessageDBM) -> MessageDataResponse:
    return MessageDataResponse.model_validate(message)


def conversation_list(
    db: Session, current_user: UserDBM
) -> list[ConvoDataShortResponse]:
    conversations = list(
        db.scalars(
            select(ConversationDBM)
            .where(ConversationDBM.user_id == current_user.id)
            .order_by(ConversationDBM.updated_at.desc(), ConversationDBM.id.desc())
        ).all()
    )
    return [_serialize_conversation(conversation) for conversation in conversations]


async def create_conversation(
    db: Session,
    current_user: UserDBM,
    data: NewConvoRequest,
) -> NewConvoResponse:
    llm_service = get_llm_service()

    try:
        response = await llm_service.create_conversation(data, user_id=current_user.id)
    except LLMError as exc:
        raise LLMRequestError(f"Failed to create conversation: {exc}") from exc

    conversation = ConversationDBM(
        user_id=current_user.id,
        title=response.llm_data.title,
        agent_type=data.agent_type,
        stable_context=response.llm_data.stable_context,
        context_summary=response.llm_data.context_summary,
        linked_items={},
    )
    db.add(conversation)
    db.flush()

    user_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.USER,
        content=data.content,
    )
    db.add(user_message)

    assistant_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.ASSISTANT,
        content=response.llm_data.content,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(conversation)
    db.refresh(assistant_message)

    message_data = MessageDataResponse(
        id=assistant_message.id,
        conversation_id=conversation.id,
        content=assistant_message.content,
        role=MessageRoleEnum.ASSISTANT,
        created_at=assistant_message.created_at,
    )

    conversation_data = ConvoDataResponse(
        id=conversation.id,
        user_id=conversation.user_id,
        title=conversation.title,
        agent_type=conversation.agent_type,

        stable_context=conversation.stable_context,
        context_summary=conversation.context_summary,
        summary_user_message_count=1,
        linked_items=conversation.linked_items,

        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )

    return NewConvoResponse(
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
    current_user: UserDBM,
    conversation_id: int,
    limit: int,
    before_message_id: int | None,
) -> MessageChunkResponse:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    query = select(MessageDBM).where(MessageDBM.conversation_id == conversation_id)
    if before_message_id is not None:
        query = query.where(MessageDBM.id < before_message_id)

    messages = list(
        db.scalars(query.order_by(MessageDBM.id.desc()).limit(limit + 1)).all()
    )
    has_more = len(messages) > limit
    message_list = messages[:limit]
    message_list.reverse()

    return MessageChunkResponse(
        message_list=[_serialize_message(message) for message in message_list],
        has_more=has_more,
    )


def delete_conversation(
    db: Session, current_user: UserDBM, conversation_id: int
) -> None:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    db.execute(delete(MessageDBM).where(MessageDBM.conversation_id == conversation_id))
    db.delete(conversation)
    db.commit()


async def respond_to_message(
    db: Session,
    current_user: UserDBM,
    conversation_id: int,
    data: MessageRequest,
) -> MessageResponse:
    conversation = db.get(ConversationDBM, conversation_id)

    if not conversation or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found or access denied.")

    recent_messages = list(
        db.scalars(
            select(MessageDBM)
            .where(MessageDBM.conversation_id == conversation.id)
            .order_by(MessageDBM.id.desc())
            .limit(llm_settings.chat_recent_message_limit)
        ).all()
    )
    recent_messages.reverse()

    stored_user_message_count = db.scalar(
        select(func.count())
        .select_from(MessageDBM)
        .where(
            MessageDBM.conversation_id == conversation.id,
            MessageDBM.role == MessageRoleEnum.USER,
        )
    ) or 0
    total_user_message_count = stored_user_message_count + 1
    summary_update_due = (
        total_user_message_count - conversation.summary_user_message_count
        >= llm_settings.chat_summary_update_user_messages
    )

    recent_message_data = [
        {"role": message.role, "content": message.content}
        for message in recent_messages
    ]

    user_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.USER,
        content=data.content,
    )
    db.add(user_message)
    db.commit()

    llm_service = get_llm_service()

    try:
        response = await llm_service.respond_to_message(
            data,
            user_id=current_user.id,
            agent_type=conversation.agent_type,
            stable_context=conversation.stable_context,
            context_summary=conversation.context_summary,
            recent_messages=recent_message_data,
        )
    except LLMError as exc:
        raise LLMRequestError(f"Failed to respond to message: {exc}") from exc

    assistant_message = MessageDBM(
        conversation_id=conversation.id,
        role=MessageRoleEnum.ASSISTANT,
        content=response.llm_data.content,
    )
    db.add(assistant_message)
    db.flush()

    conversation.updated_at = assistant_message.created_at
    db.commit()
    db.refresh(assistant_message)

    return MessageResponse(
        message_data=MessageDataResponse.model_validate(assistant_message),
        provider=response.provider,
        model=response.model,
        model_str=response.model_str,
        finish_reason=response.finish_reason,
        usage=response.usage,
        response_id=response.response_id,
        response_time_ms=response.response_time_ms,
        cost=response.cost,
    )
