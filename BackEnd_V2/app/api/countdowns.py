from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.countdown import (
    CountdownCreateRequest,
    CountdownDetailResponse,
    CountdownResponse,
    CountdownUpdateRequest,
)
from app.schemas.journal import JournalEntryResponse
from app.services import countdown_service, journal_service

router = APIRouter(prefix=ENDPOINTS.COUNTDOWNS.PREFIX, tags=["Countdowns"])


@router.get(ENDPOINTS.COUNTDOWNS.ROOT, response_model=list[CountdownResponse])
def list_countdowns(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[CountdownResponse]:
    return countdown_service.list_countdowns(db, current_user)


@router.post(ENDPOINTS.COUNTDOWNS.ROOT, response_model=CountdownDetailResponse, status_code=status.HTTP_201_CREATED)
def create_countdown(
    data: CountdownCreateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> CountdownDetailResponse:
    return countdown_service.create_countdown(db, current_user, data)


@router.get(ENDPOINTS.COUNTDOWNS.DETAIL, response_model=CountdownDetailResponse)
def get_countdown(
    countdown_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> CountdownDetailResponse:
    return countdown_service.get_countdown(db, current_user, countdown_id)


@router.patch(ENDPOINTS.COUNTDOWNS.DETAIL, response_model=CountdownDetailResponse)
def update_countdown(
    countdown_id: int,
    data: CountdownUpdateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> CountdownDetailResponse:
    return countdown_service.update_countdown(db, current_user, countdown_id, data)


@router.delete(ENDPOINTS.COUNTDOWNS.DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_countdown(
    countdown_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    countdown_service.delete_countdown(db, current_user, countdown_id)


@router.get(ENDPOINTS.COUNTDOWNS.NOTES, response_model=list[JournalEntryResponse])
def get_countdown_notes(
    countdown_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[JournalEntryResponse]:
    return journal_service.get_countdown_entries(db, current_user, countdown_id)
