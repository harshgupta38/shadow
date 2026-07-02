"""Memory (understanding) business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory import MemoryEntry
from app.models.enums import MemorySource
from app.models.user import User
from app.schemas.memory import (
    MemoryCenterEntryRead,
    MemoryEntryCreate,
    MemoryEntryUpdate,
)
from app.services.utils import get_owned_or_404

_MEMORY_USED_BY = ["assistant", "planner", "reports", "journal"]


def _confidence_from_source(source: MemorySource) -> str:
    if source == MemorySource.manual:
        return "very_high"
    if source == MemorySource.onboarding:
        return "high"
    if source == MemorySource.behavior:
        return "medium"
    return "medium"


def list_memories(db: Session, user: User) -> list[MemoryEntry]:
    return list(
        db.scalars(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user.id)
            .order_by(MemoryEntry.created_at.desc())
        )
    )


def add_memory(db: Session, user: User, data: MemoryEntryCreate) -> MemoryEntry:
    entry = MemoryEntry(
        user_id=user.id,
        category=data.category,
        question=data.question,
        answer=data.answer,
        ai_understanding=data.ai_understanding,
        source=data.source,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_memory(
    db: Session, user: User, memory_id: int, data: MemoryEntryUpdate
) -> MemoryEntry:
    entry = get_owned_or_404(db, MemoryEntry, memory_id, user.id, name="Memory")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_memory(db: Session, user: User, memory_id: int) -> None:
    entry = get_owned_or_404(db, MemoryEntry, memory_id, user.id, name="Memory")
    db.delete(entry)
    db.commit()


def list_memory_center(db: Session, user: User) -> list[MemoryCenterEntryRead]:
    entries = list_memories(db, user)
    return [
        MemoryCenterEntryRead(
            id=entry.id,
            category=entry.category,
            value=entry.ai_understanding,
            source=entry.source,
            confidence=_confidence_from_source(entry.source),
            editable=True,
            used_by=_MEMORY_USED_BY,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )
        for entry in entries
    ]
