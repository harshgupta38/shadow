"""Profile & memory routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.memory import (
    MemoryCenterEntryRead,
    MemoryEntryCreate,
    MemoryEntryRead,
    MemoryEntryUpdate,
)
from app.schemas.profile import (
    AIProfileRead,
    AIProfileUpdate,
    BasicProfileRead,
    BasicProfileUpdate,
)
from app.schemas.user import ProfileUpdate, UserRead
from app.services import memory_service, profile_service

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
