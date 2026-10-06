from datetime import date

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.journal import JournalEntryResponse, JournalEntryUpsertRequest
from app.services import journal_service

router = APIRouter(prefix=ENDPOINTS.JOURNAL.PREFIX, tags=["Journal"])


@router.get(ENDPOINTS.JOURNAL.LIST, response_model=list[JournalEntryResponse])
def get_entries(
    start: date,
    end: date,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[JournalEntryResponse]:
    return journal_service.get_entries(db, current_user, start, end)


@router.post(ENDPOINTS.JOURNAL.ENTRY, response_model=JournalEntryResponse)
def upsert_entry(
    entry_date: date,
    data: JournalEntryUpsertRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> JournalEntryResponse:
    return journal_service.upsert_entry(db, current_user, entry_date, data)
