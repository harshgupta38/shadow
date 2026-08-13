from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.chat import Conversation
from app.schemas.chat import ConversationData


def _serialize_conversation(conversation: Conversation) -> ConversationData:
    return ConversationData.model_validate(conversation)


def conversation_list(db: Session, current_user: User) -> list[ConversationData]:
    conversations = list(
        db.scalars(
            select(Conversation)
            .where(Conversation.user_id == current_user.id)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        ).all()
    )
    return [_serialize_conversation(conversation) for conversation in conversations]
