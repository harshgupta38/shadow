"""Memory (understanding) business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.memory import MemoryEntry
from app.models.user import User
from app.schemas.memory import MemoryEntryCreate


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
