"""Journal routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, Provider
from app.schemas.journal import JournalCreate, JournalRead, JournalUpdate
from app.services import journal_service

router = APIRouter(prefix="/journal", tags=["journal"])


@router.get("", response_model=list[JournalRead])
def list_entries(db: DbSession, current_user: CurrentUser) -> list[JournalRead]:
    return journal_service.list_entries(db, current_user)


@router.post("", response_model=JournalRead, status_code=status.HTTP_201_CREATED)
def create_entry(
    data: JournalCreate,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> JournalRead:
    return journal_service.create_entry(db, current_user, data, provider)


@router.put("/{entry_id}", response_model=JournalRead)
def update_entry(
    entry_id: int,
    data: JournalUpdate,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> JournalRead:
    return journal_service.update_entry(db, current_user, entry_id, data, provider)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, db: DbSession, current_user: CurrentUser) -> None:
    journal_service.delete_entry(db, current_user, entry_id)
