from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.chat import Conversation
from app.schemas.chat import (
    ConversationData,
    ConversationDataList,
    SendMessageRequest,
)
from app.llm.models import SendMessageResponse


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


def create_conversation(
    db: Session,
    current_user: User,
    data: SendMessageRequest,
) -> SendMessageResponse:

    new_conversation = ConversationData(
        id=0,
        user_id=current_user.id,
        title="",
        agent_type=data.agent_type,

        stable_context="",
        context_summary="",
        linked_items={},

        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    conversation = Conversation(
        user_id=current_user.id,
        title=data.title,
        context_summary="",
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _serialize_conversation(conversation)
