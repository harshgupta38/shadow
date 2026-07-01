"""Profile & memory routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.memory import MemoryEntryCreate, MemoryEntryRead
from app.schemas.user import ProfileUpdate, UserRead
from app.services import memory_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserRead)
def get_profile(current_user: CurrentUser) -> UserRead:
    return current_user


@router.put("", response_model=UserRead)
def update_profile(data: ProfileUpdate, db: DbSession, current_user: CurrentUser) -> UserRead:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/memories", response_model=list[MemoryEntryRead])
def list_memories(db: DbSession, current_user: CurrentUser) -> list[MemoryEntryRead]:
    return memory_service.list_memories(db, current_user)


@router.post("/memories", response_model=MemoryEntryRead, status_code=status.HTTP_201_CREATED)
def add_memory(
    data: MemoryEntryCreate, db: DbSession, current_user: CurrentUser
) -> MemoryEntryRead:
    return memory_service.add_memory(db, current_user, data)
