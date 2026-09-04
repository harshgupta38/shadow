"""Profile & memory routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, Provider
from app.schemas.common import Message
from app.schemas.memory import (
    MemoryCenterEntryRead,
    MemoryEntryCreate,
    MemoryEntryRead,
    MemoryRefineRequest,
    MemoryRefineResponse,
    MemoryEntryUpdate,
)
from app.schemas.profile import (
    AccountDataExportRead,
    AccountOverviewRead,
    AIProfileRead,
    AIProfileUpdate,
    BasicProfileRead,
    BasicProfileUpdate,
    ChatHistoryClearResult,
    DeleteAccountRequest,
)
from app.schemas.auth import ChangePasswordRequest
from app.schemas.user import ProfileUpdate, UserRead
from app.services import auth_service, memory_service, profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserRead)
def get_profile(current_user: CurrentUser) -> UserRead:
    return current_user


@router.put("", response_model=UserRead)
def update_profile(data: ProfileUpdate, db: DbSession, current_user: CurrentUser) -> UserRead:
    updates = data.model_dump(exclude_unset=True)
    if "timezone" in updates:
        updates["timezone"] = "Asia/Kolkata"

    for field, value in updates.items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/basic", response_model=BasicProfileRead)
def get_basic_profile(db: DbSession, current_user: CurrentUser) -> BasicProfileRead:
    return profile_service.get_basic_profile(db, current_user)


@router.put("/basic", response_model=BasicProfileRead)
def update_basic_profile(
    data: BasicProfileUpdate, db: DbSession, current_user: CurrentUser
) -> BasicProfileRead:
    return profile_service.update_basic_profile(db, current_user, data)


@router.get("/ai", response_model=AIProfileRead)
def get_ai_profile(db: DbSession, current_user: CurrentUser) -> AIProfileRead:
    return profile_service.get_ai_profile(db, current_user)


@router.put("/ai", response_model=AIProfileRead)
def update_ai_profile(
    data: AIProfileUpdate, db: DbSession, current_user: CurrentUser
) -> AIProfileRead:
    return profile_service.update_ai_profile(db, current_user, data)


@router.get("/account", response_model=AccountOverviewRead)
def get_account_overview(db: DbSession, current_user: CurrentUser) -> AccountOverviewRead:
    return profile_service.get_account_overview(db, current_user)


@router.post("/change-password", response_model=Message)
def change_password(
    data: ChangePasswordRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> Message:
    auth_service.change_password(
        db,
        current_user,
        current_password=data.current_password,
        new_password=data.new_password,
    )
    return Message(detail="Password updated successfully")


@router.post("/clear-chat-history", response_model=ChatHistoryClearResult)
def clear_chat_history(db: DbSession, current_user: CurrentUser) -> ChatHistoryClearResult:
    return profile_service.clear_chat_history(db, current_user)


@router.get("/export", response_model=AccountDataExportRead)
def export_account_data(db: DbSession, current_user: CurrentUser) -> AccountDataExportRead:
    return profile_service.export_account_data(db, current_user)


@router.delete("/account", status_code=status.HTTP_200_OK, response_model=Message)
def delete_account(
    data: DeleteAccountRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> Message:
    profile_service.delete_account(db, current_user, confirmation_text=data.confirmation_text)
    return Message(detail="Account deleted")


@router.get("/memory-center", response_model=list[MemoryCenterEntryRead])
def list_memory_center(
    db: DbSession, current_user: CurrentUser
) -> list[MemoryCenterEntryRead]:
    return memory_service.list_memory_center(db, current_user)


@router.get("/memories", response_model=list[MemoryEntryRead])
def list_memories(db: DbSession, current_user: CurrentUser) -> list[MemoryEntryRead]:
    return memory_service.list_memories(db, current_user)


@router.post("/memories", response_model=MemoryEntryRead, status_code=status.HTTP_201_CREATED)
def add_memory(
    data: MemoryEntryCreate, db: DbSession, current_user: CurrentUser
) -> MemoryEntryRead:
    return memory_service.add_memory(db, current_user, data)


@router.post("/memories/refine", response_model=MemoryRefineResponse)
def refine_memory_text(
    data: MemoryRefineRequest,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> MemoryRefineResponse:
    result = memory_service.refine_memory_text(db, current_user, provider, data)
    return MemoryRefineResponse(
        refined_text=result.refined_text,
        status=result.status,
        reason=result.reason,
    )


@router.put("/memories/{memory_id}", response_model=MemoryEntryRead)
def update_memory(
    memory_id: int,
    data: MemoryEntryUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> MemoryEntryRead:
    return memory_service.update_memory(db, current_user, memory_id, data)


@router.delete("/memories/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_memory(memory_id: int, db: DbSession, current_user: CurrentUser) -> None:
    memory_service.delete_memory(db, current_user, memory_id)
