"""Chat business logic — sessions, messages, and AI replies via agents."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.agents.orchestrator import generate_chat_reply
from app.llm.base import LLMMessage, LLMProvider
from app.memory.context import compile_user_context
from app.models.base import utcnow
from app.models.chat import ChatMessage, ChatSession
from app.models.enums import ChatRole
from app.models.user import User
from app.schemas.chat import ChatSessionCreate
from app.services.utils import get_owned_or_404


def list_sessions(db: Session, user: User) -> list[ChatSession]:
    return list(
        db.scalars(
            select(ChatSession)
            .where(ChatSession.user_id == user.id)
            .order_by(ChatSession.updated_at.desc())
        )
    )


def clear_history(db: Session, user: User) -> None:
    """Delete all of the user's chat sessions and their messages."""
    session_ids = select(ChatSession.id).where(ChatSession.user_id == user.id).scalar_subquery()
    db.execute(delete(ChatMessage).where(ChatMessage.session_id.in_(session_ids)))
    db.execute(delete(ChatSession).where(ChatSession.user_id == user.id))
    db.commit()


def create_session(db: Session, user: User, data: ChatSessionCreate) -> ChatSession:
    session = ChatSession(user_id=user.id, agent_type=data.agent_type, title=data.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, user: User, session_id: int) -> ChatSession:
    return get_owned_or_404(db, ChatSession, session_id, user.id, name="Chat session")


def list_messages(db: Session, user: User, session_id: int) -> list[ChatMessage]:
    session = get_session(db, user, session_id)
    return list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at, ChatMessage.id)
        )
    )


def send_message(
    db: Session,
    user: User,
    session_id: int,
    content: str,
    provider: LLMProvider,
) -> tuple[ChatMessage, ChatMessage]:
    """Persist the user message, generate an AI reply, persist and return both."""
    session = get_session(db, user, session_id)

    user_message = ChatMessage(
        session_id=session.id,
        role=ChatRole.user,
        content=content,
        agent_type=session.agent_type,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    history_rows = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at, ChatMessage.id)
        )
    )
    history = [LLMMessage(role=row.role.value, content=row.content) for row in history_rows]

    reply = generate_chat_reply(
        provider,
        agent_type=session.agent_type,
        history=history,
        user_context=compile_user_context(db, user),
    )

    assistant_message = ChatMessage(
        session_id=session.id,
        role=ChatRole.assistant,
        content=reply,
        agent_type=session.agent_type,
    )
    db.add(assistant_message)
    session.updated_at = utcnow()  # touch session ordering
    db.commit()
    db.refresh(assistant_message)
    return user_message, assistant_message
