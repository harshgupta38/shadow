"""AI chat routes — sessions and messages."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, Provider
from app.schemas.chat import (
    ChatActionExecuteRequest,
    ChatActionExecuteResponse,
    ChatMessageCreate,
    ChatMessageRead,
    ChatSendResponse,
    ChatSessionCreate,
    ChatSessionRead,
)
from app.services import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/sessions", response_model=list[ChatSessionRead])
def list_sessions(db: DbSession, current_user: CurrentUser) -> list[ChatSessionRead]:
    return chat_service.list_sessions(db, current_user)


@router.post("/sessions", response_model=ChatSessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    data: ChatSessionCreate, db: DbSession, current_user: CurrentUser
) -> ChatSessionRead:
    return chat_service.create_session(db, current_user, data)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int, db: DbSession, current_user: CurrentUser) -> None:
    chat_service.delete_session(db, current_user, session_id)


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageRead])
def list_messages(
    session_id: int, db: DbSession, current_user: CurrentUser
) -> list[ChatMessageRead]:
    return chat_service.list_messages(db, current_user, session_id)


@router.post("/sessions/{session_id}/messages", response_model=ChatSendResponse)
def send_message(
    session_id: int,
    data: ChatMessageCreate,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> ChatSendResponse:
    user_message, assistant_message, session, proposed_actions = chat_service.send_message(
        db,
        current_user,
        session_id,
        data.content,
        provider,
        fresh_intake_mode=data.fresh_intake_mode,
    )
    return ChatSendResponse(
        user_message=ChatMessageRead.model_validate(user_message),
        assistant_message=ChatMessageRead.model_validate(assistant_message),
        session=ChatSessionRead.model_validate(session),
        proposed_actions=proposed_actions,
    )


@router.post(
    "/sessions/{session_id}/actions/execute",
    response_model=ChatActionExecuteResponse,
)
def execute_action(
    session_id: int,
    data: ChatActionExecuteRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> ChatActionExecuteResponse:
    return chat_service.execute_action(
        db,
        current_user,
        session_id,
        data.action,
        confirmed=data.confirmed,
    )
