from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.schedule import (
    ScheduledTaskCreateRequest,
    ScheduledTaskDataResponse,
    ScheduledTaskUpdateRequest,
    SaveScheduledTaskFromProposalRequest,
)
from app.services import schedule_service

router = APIRouter(prefix=ENDPOINTS.SCHEDULE.PREFIX, tags=["Schedule"])


@router.post(
    ENDPOINTS.SCHEDULE.FROM_PROPOSAL,
    response_model=ScheduledTaskDataResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_schedule_task_from_proposal(
    data: SaveScheduledTaskFromProposalRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ScheduledTaskDataResponse:
    return schedule_service.save_task_from_proposal(db, current_user, data)


@router.get(ENDPOINTS.SCHEDULE.GET_LIST, response_model=list[ScheduledTaskDataResponse])
def get_schedule_task_list(
    year: int = Query(..., ge=2020, le=2220),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[ScheduledTaskDataResponse]:
    return schedule_service.get_list(db, current_user, year, month)


@router.get(ENDPOINTS.SCHEDULE.DETAIL, response_model=ScheduledTaskDataResponse)
def get_schedule_task(
    schedule_task_id: int,
    is_yearly: bool = Query(default=False),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ScheduledTaskDataResponse:
    return schedule_service.get_task(db, current_user, schedule_task_id, is_yearly)


@router.post(
    ENDPOINTS.SCHEDULE.SAVE,
    response_model=ScheduledTaskDataResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_schedule_task(
    data: ScheduledTaskCreateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ScheduledTaskDataResponse:
    return schedule_service.save_task(db, current_user, data)


@router.patch(ENDPOINTS.SCHEDULE.DETAIL, response_model=ScheduledTaskDataResponse)
def update_schedule_task(
    schedule_task_id: int,
    data: ScheduledTaskUpdateRequest,
    is_yearly: bool = Query(default=False),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ScheduledTaskDataResponse:
    return schedule_service.update_task(db, current_user, schedule_task_id, data, is_yearly)


@router.delete(ENDPOINTS.SCHEDULE.DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_task(
    schedule_task_id: int,
    is_yearly: bool = Query(default=False),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    schedule_service.delete_task(db, current_user, schedule_task_id, is_yearly)
