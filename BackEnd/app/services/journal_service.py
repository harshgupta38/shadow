"""Journal business logic."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journal import JournalEntry
from app.models.user import User
from app.schemas.journal import JournalCreate, JournalUpdate
from app.services.utils import get_owned_or_404


def list_entries(db: Session, user: User) -> list[JournalEntry]:
    return list(
        db.scalars(
            select(JournalEntry)
            .where(JournalEntry.user_id == user.id)
            .order_by(JournalEntry.created_at.desc())
        )
    )


def create_entry(db: Session, user: User, data: JournalCreate) -> JournalEntry:
    entry = JournalEntry(user_id=user.id, content=data.content, mood=data.mood)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_entry(db: Session, user: User, entry_id: int, data: JournalUpdate) -> JournalEntry:
    entry = get_owned_or_404(db, JournalEntry, entry_id, user.id, name="Journal entry")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: Session, user: User, entry_id: int) -> None:
    entry = get_owned_or_404(db, JournalEntry, entry_id, user.id, name="Journal entry")
    db.delete(entry)
    db.commit()
