from collections import defaultdict
from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import today_ist
from app.core.exceptions import NotFoundError, ValidationError
from app.models.countdown import CountdownDBM, CountdownJournalLinkDBM
from app.models.journal import JournalEntryDBM
from app.models.user import UserDBM
from app.schemas.journal import JournalEntryResponse, JournalEntryUpsertRequest


# A day that was opened and then cleared still has a row. These are the days with a mood or some text.
HAS_CONTENT = (JournalEntryDBM.mood.is_not(None)) | (func.length(func.trim(JournalEntryDBM.text)) > 0)


def _serialize(entry: JournalEntryDBM, countdown_ids: list[int] | None = None) -> JournalEntryResponse:
    response = JournalEntryResponse.model_validate(entry)
    response.countdown_ids = sorted(countdown_ids or [])
    return response


def _links_of(db: Session, entry_ids: list[int]) -> dict[int, list[int]]:
    """The countdowns each journal entry is tagged to."""
    links: dict[int, list[int]] = defaultdict(list)
    if entry_ids:
        for entry_id, countdown_id in db.execute(
            select(CountdownJournalLinkDBM.journal_entry_id, CountdownJournalLinkDBM.countdown_id).where(
                CountdownJournalLinkDBM.journal_entry_id.in_(entry_ids)
            )
        ).all():
            links[entry_id].append(countdown_id)
    return links


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

    links = _links_of(db, [e.id for e in entries])
    return [_serialize(e, links.get(e.id)) for e in entries]


def get_countdown_entries(db: Session, current_user: UserDBM, countdown_id: int) -> list[JournalEntryResponse]:
    """Every journal day tagged to the countdown that has a mood or text, the newest first: the countdown's notes."""
    if db.scalar(select(CountdownDBM.id).where(CountdownDBM.id == countdown_id, CountdownDBM.user_id == current_user.id)) is None:
        raise NotFoundError("Countdown not found.")
    entries = db.scalars(
        select(JournalEntryDBM)
        .join(CountdownJournalLinkDBM, CountdownJournalLinkDBM.journal_entry_id == JournalEntryDBM.id)
        .where(CountdownJournalLinkDBM.countdown_id == countdown_id, JournalEntryDBM.user_id == current_user.id, HAS_CONTENT)
        .order_by(JournalEntryDBM.entry_date.desc())
    ).all()
    links = _links_of(db, [e.id for e in entries])
    return [_serialize(e, links.get(e.id)) for e in entries]


def _find_entry(db: Session, user_id: int, entry_date: date) -> JournalEntryDBM | None:
    return db.scalar(
        select(JournalEntryDBM).where(
            JournalEntryDBM.user_id == user_id,
            JournalEntryDBM.entry_date == entry_date,
        )
    )


def _checked_countdown_ids(db: Session, user_id: int, countdown_ids: list[int]) -> list[int]:
    """The ids without repeats, after checking that every one is the person's own countdown."""
    wanted = sorted(set(countdown_ids))
    owned = set(db.scalars(select(CountdownDBM.id).where(CountdownDBM.user_id == user_id, CountdownDBM.id.in_(wanted))).all()) if wanted else set()
    if owned != set(wanted):
        raise NotFoundError("Countdown not found.")
    return wanted


def _apply(db: Session, entry: JournalEntryDBM, data: JournalEntryUpsertRequest, countdown_ids: list[int] | None) -> None:
    entry.mood = data.mood
    entry.text = data.text
    if countdown_ids is not None:
        db.flush()  # a new entry needs its id before it can be tagged
        db.execute(delete(CountdownJournalLinkDBM).where(CountdownJournalLinkDBM.journal_entry_id == entry.id))
        db.add_all(CountdownJournalLinkDBM(countdown_id=cid, journal_entry_id=entry.id) for cid in countdown_ids)


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
    countdown_ids = _checked_countdown_ids(db, user_id, data.countdown_ids) if data.countdown_ids is not None else None

    entry = _find_entry(db, user_id, entry_date)
    if entry is None:
        entry = JournalEntryDBM(user_id=user_id, entry_date=entry_date, mood=data.mood, text=data.text)
        db.add(entry)
    _apply(db, entry, data, countdown_ids)

    try:
        db.commit()
    except IntegrityError:
        # A concurrent request (e.g. a second tab) inserted this date first. This request is
        # the newer edit, so apply it to the row that won rather than failing.
        db.rollback()
        entry = _find_entry(db, user_id, entry_date)
        if entry is None:
            raise
        _apply(db, entry, data, countdown_ids)
        db.commit()

    db.refresh(entry)
    return _serialize(entry, _links_of(db, [entry.id]).get(entry.id))
