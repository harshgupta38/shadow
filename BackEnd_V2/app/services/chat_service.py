from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.llm.enums import LLMProvider
from app.analysis.chat_usage_logger import log_chat_usage_async
from app.core.exceptions import NotFoundError
from app.llm.config import llm_settings
from app.llm.exceptions import LLMError
from app.llm.models import ChatRequest
from app.llm.service import get_llm_service
from app.models.chat import Conversation, Message
from app.models.user import User
from app.schemas.chat import (
    ChatMessagePage,
    ChatMessageRead,
    ChatSendRequest,
    ChatSendResponse,
    ConversationCreateRequest,
    ConversationRead,
)
from app.services.chat_context_service import build_chat_context

logger = logging.getLogger(__name__)


def _configured_provider_and_model() -> tuple[str, str]:
    provider = llm_settings.llm_provider
    provider_model_map = {
        LLMProvider.OLLAMA: str(llm_settings.ollama_model),
        LLMProvider.OPENAI: str(llm_settings.openai_model),
        LLMProvider.GEMINI: str(llm_settings.gemini_model),
        LLMProvider.CLAUDE: str(llm_settings.claude_model),
    }
    return provider.value, provider_model_map.get(provider, "")


def _serialize_conversation(conversation: Conversation) -> ConversationRead:
    return ConversationRead.model_validate(conversation)


def _serialize_message(message: Message) -> ChatMessageRead:
    return ChatMessageRead.model_validate(message)


def create_conversation(
    db: Session,
    current_user: User,
    data: ConversationCreateRequest,
) -> ConversationRead:
    conversation = Conversation(
        user_id=current_user.id,
        title=data.title,
        context_summary="",
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return _serialize_conversation(conversation)


def list_conversations(db: Session, current_user: User) -> list[ConversationRead]:
    conversations = list(
        db.scalars(
            select(Conversation)
            .where(Conversation.user_id == current_user.id)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        ).all()
    )
    return [_serialize_conversation(conversation) for conversation in conversations]


def get_conversation(db: Session, current_user: User, conversation_id: int) -> ConversationRead:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    if conversation is None:
        raise NotFoundError("Conversation not found.")
    return _serialize_conversation(conversation)


def delete_conversation(db: Session, current_user: User, conversation_id: int) -> None:
    conversation = _get_conversation_or_404(db, current_user, conversation_id)
    db.delete(conversation)
    db.commit()


def _get_conversation_or_404(db: Session, current_user: User, conversation_id: int) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    if conversation is None:
        raise NotFoundError("Conversation not found.")
    return conversation


def get_messages(
    db: Session,
    current_user: User,
    conversation_id: int,
    limit: int,
    before_message_id: int | None,
) -> ChatMessagePage:
    _get_conversation_or_404(db, current_user, conversation_id)

    query = select(Message).where(Message.conversation_id == conversation_id)
    if before_message_id is not None:
        query = query.where(Message.id < before_message_id)

    messages = list(
        db.scalars(query.order_by(Message.id.desc()).limit(limit + 1)).all()
    )
    has_more = len(messages) > limit
    items = messages[:limit]
    items.reverse()

    return ChatMessagePage(
        items=[_serialize_message(message) for message in items],
        limit=limit,
        before_message_id=before_message_id,
        has_more=has_more,
    )


def _append_message(db: Session, conversation_id: int, role: str, content: str) -> Message:
    message = Message(conversation_id=conversation_id, role=role, content=content)
    db.add(message)
    db.flush()
    return message


def _maybe_generate_title(conversation: Conversation, user_message: str) -> None:
    if conversation.title is None or not conversation.title.strip():
        conversation.title = user_message[:60]


async def send_message(
    db: Session,
    current_user: User,
    conversation_id: int,
    data: ChatSendRequest,
) -> ChatSendResponse:
    conversation = _get_conversation_or_404(db, current_user, conversation_id)

    user_message = _append_message(db, conversation.id, "user", data.content.strip())
    _maybe_generate_title(conversation, user_message.content)
    db.commit()

    user_message_count = db.scalar(
        select(func.count(Message.id)).where(
            Message.conversation_id == conversation.id,
            Message.role == "user",
        )
    ) or 0

    previous_summary = conversation.context_summary or ""
    context = build_chat_context(
        db,
        current_user,
        conversation.id,
        user_message.id,
        data.content,
        previous_summary,
    )

    llm_service = get_llm_service()
    chat_request = ChatRequest(
        prompt=_build_chat_prompt(data.content, context, previous_summary),
        system_prompt=context.stable_context,
        operation="chat",
        user_id=current_user.id,
        model=None,
        temperature=0.4,
        max_tokens=800,
    )

    try:
        chat_response = await llm_service.chat(chat_request)
    except LLMError as exc:
        try:
            provider, model = _configured_provider_and_model()
            await log_chat_usage_async(
                provider=provider,
                model=model,
                operation="chat",
                request_id=None,
                latency_ms=None,
                input_tokens=None,
                output_tokens=None,
                total_tokens=None,
                input_cost=None,
                output_cost=None,
                total_cost=None,
                status="error",
                user_id=current_user.id,
                error=str(exc),
            )
        except Exception:
            logger.exception("Failed to log failed chat usage.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Chat failed: {exc}",
        ) from exc

    assistant_message = _append_message(db, conversation.id, "assistant", chat_response.content)

    summary_updated = False
    if user_message_count % llm_settings.chat_summary_update_user_messages == 0:
        summary_updated = await _refresh_summary(db, conversation, current_user)

    db.commit()

    try:
        await log_chat_usage_async(
            provider=chat_response.provider.value,
            model=chat_response.model_str or chat_response.model,
            operation=chat_response.operation,
            request_id=chat_response.response_id,
            latency_ms=chat_response.response_time_ms,
            input_tokens=chat_response.usage.input_tokens if chat_response.usage else None,
            output_tokens=chat_response.usage.output_tokens if chat_response.usage else None,
            total_tokens=chat_response.usage.total_tokens if chat_response.usage else None,
            input_cost=chat_response.cost.input_token_cost if chat_response.cost else None,
            output_cost=chat_response.cost.output_token_cost if chat_response.cost else None,
            total_cost=chat_response.cost.total_cost if chat_response.cost else None,
            status="success",
            user_id=current_user.id,
        )
    except Exception:
        logger.exception("Failed to log chat usage.")

    return ChatSendResponse(
        conversation_id=conversation.id,
        message=_serialize_message(assistant_message),
        summary_updated=summary_updated,
    )


def _build_chat_prompt(message: str, context, previous_summary: str) -> str:
    sections: list[str] = [
        "SYSTEM",
        "You are Shadow, the user's personal goal coach and general assistant.",
        "Be concise, practical, and grounded in the provided context.",
    ]

    if previous_summary.strip():
        sections.extend(["CONVERSATION SUMMARY", previous_summary.strip()])

    if context.live_context.strip():
        sections.extend(["RELEVANT LIVE DATA", context.live_context.strip()])

    if context.recent_messages:
        sections.append("RECENT CONVERSATION")
        for role, content in context.recent_messages:
            sections.append(f"{role.title()}: {content}")

    sections.extend(["CURRENT MESSAGE", message.strip()])
    return "\n".join(sections)


async def _refresh_summary(db: Session, conversation: Conversation, current_user: User) -> bool:
    recent_rows = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.id.desc())
            .limit(llm_settings.chat_recent_message_limit * 2)
        ).all()
    )
    recent_rows.reverse()
    if not recent_rows:
        return False

    summary_prompt = _build_summary_prompt(conversation.context_summary, recent_rows)
    llm_service = get_llm_service()
    try:
        summary_response = await llm_service.chat(
            ChatRequest(
                prompt=summary_prompt,
                system_prompt=(
                    "Summarize the conversation into compact long-term memory. "
                    "Do not produce a transcript. Focus on durable coaching context, "
                    "important decisions, and user preferences. Do not duplicate structured database state."
                ),
                operation="chat_context_summary",
                user_id=current_user.id,
                temperature=0.2,
                max_tokens=256,
            )
        )
    except LLMError:
        try:
            provider, model = _configured_provider_and_model()
            await log_chat_usage_async(
                provider=provider,
                model=model,
                operation="chat_context_summary",
                request_id=None,
                latency_ms=None,
                input_tokens=None,
                output_tokens=None,
                total_tokens=None,
                input_cost=None,
                output_cost=None,
                total_cost=None,
                status="error",
                user_id=current_user.id,
                error="summary_generation_failed",
            )
        except Exception:
            logger.exception("Failed to log summary failure usage.")
        logger.exception("Conversation summary refresh failed.")
        return False

    conversation.context_summary = summary_response.content.strip()
    db.add(conversation)
    try:
        await log_chat_usage_async(
            provider=summary_response.provider.value,
            model=summary_response.model_str or summary_response.model,
            operation="chat_context_summary",
            request_id=summary_response.response_id,
            latency_ms=summary_response.response_time_ms,
            input_tokens=summary_response.usage.input_tokens if summary_response.usage else None,
            output_tokens=summary_response.usage.output_tokens if summary_response.usage else None,
            total_tokens=summary_response.usage.total_tokens if summary_response.usage else None,
            input_cost=summary_response.cost.input_token_cost if summary_response.cost else None,
            output_cost=summary_response.cost.output_token_cost if summary_response.cost else None,
            total_cost=summary_response.cost.total_cost if summary_response.cost else None,
            status="success",
            user_id=current_user.id,
        )
    except Exception:
        logger.exception("Failed to log summary usage.")
    return True


def _build_summary_prompt(previous_summary: str, recent_rows: list[Message]) -> str:
    lines = ["Existing summary:", previous_summary.strip() or "(empty)", "", "Recent messages:"]
    for row in recent_rows:
        lines.append(f"{row.role.title()}: {row.content}")
    lines.append("")
    lines.append("Write an updated compact summary.")
    return "\n".join(lines)