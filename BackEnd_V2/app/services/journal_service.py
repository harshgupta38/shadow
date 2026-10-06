from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import today_ist
from app.core.exceptions import ValidationError
from app.models.journal import JournalEntryDBM
from app.models.user import UserDBM
from app.schemas.journal import JournalEntryResponse, JournalEntryUpsertRequest


def _serialize(entry: JournalEntryDBM) -> JournalEntryResponse:
    return JournalEntryResponse.model_validate(entry)


def get_entries(
    db: Session,
    current_user: UserDBM,
    start: date,
    end: date,
) -> list[JournalEntryResponse]:
    if end < start:
        raise ValidationError("end date must be on or after start date.")
    if (end - start).days + 1 > 31:
        raise ValidationError("Date range may not exceed 31 days.")

    entries = db.scalars(
        select(JournalEntryDBM)
        .where(
            JournalEntryDBM.user_id == current_user.id,
            JournalEntryDBM.entry_date >= start,
            JournalEntryDBM.entry_date <= end,
        )
        .order_by(JournalEntryDBM.entry_date)
    ).all()

    return [_serialize(e) for e in entries]


def _find_entry(db: Session, user_id: int, entry_date: date) -> JournalEntryDBM | None:
    return db.scalar(
        select(JournalEntryDBM).where(
            JournalEntryDBM.user_id == user_id,
            JournalEntryDBM.entry_date == entry_date,
        )
    )


def upsert_entry(
    db: Session,
    current_user: UserDBM,
    entry_date: date,
    data: JournalEntryUpsertRequest,
) -> JournalEntryResponse:
    if entry_date > today_ist():
        raise ValidationError("Cannot create a journal entry for a future date.")

    # Read before any rollback, which expires current_user's attributes.
    user_id = current_user.id

    entry = _find_entry(db, user_id, entry_date)
    if entry is None:
        entry = JournalEntryDBM(
            user_id=user_id,
            entry_date=entry_date,
            mood=data.mood,
            text=data.text,
        )
        db.add(entry)
    else:
        entry.mood = data.mood
        entry.text = data.text

    try:
        db.commit()
    except IntegrityError:
        # A concurrent request (e.g. a second tab) inserted this date first. This request is
        # the newer edit, so apply it to the row that won rather than failing.
        db.rollback()
        entry = _find_entry(db, user_id, entry_date)
        if entry is None:
            raise
        entry.mood = data.mood
        entry.text = data.text
        db.commit()

    db.refresh(entry)
    return _serialize(entry)
