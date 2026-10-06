from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.schedule import (
    SubtaskCreateRequest,
    SubtaskResponse,
    SubtaskUpdateRequest,
    ScheduledTaskCreateRequest,
    ScheduledTaskDataResponse,
    ScheduledTaskUpdateRequest,
    SaveScheduledTaskFromProposalRequest,
    ScheduleListResponse,
)
from app.services import schedule_service, schedule_subtask_service

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


@router.get(ENDPOINTS.SCHEDULE.GET_LIST, response_model=ScheduleListResponse)
def get_schedule_task_list(
    year: int = Query(..., ge=2020, le=2220),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ScheduleListResponse:
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


# ── Sub-tasks ─────────────────────────────────────────────────────────────────

@router.get(ENDPOINTS.SCHEDULE.SUBTASKS, response_model=list[SubtaskResponse])
def get_subtasks(
    schedule_task_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[SubtaskResponse]:
    return schedule_subtask_service.list_subtasks(db, current_user, schedule_task_id)


@router.post(
    ENDPOINTS.SCHEDULE.SUBTASKS,
    response_model=SubtaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_subtask(
    schedule_task_id: int,
    data: SubtaskCreateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> SubtaskResponse:
    return schedule_subtask_service.create_subtask(db, current_user, schedule_task_id, data)


@router.patch(ENDPOINTS.SCHEDULE.SUBTASK_DETAIL, response_model=SubtaskResponse)
def update_subtask(
    schedule_task_id: int,
    subtask_id: int,
    data: SubtaskUpdateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> SubtaskResponse:
    return schedule_subtask_service.update_subtask(db, current_user, schedule_task_id, subtask_id, data)


@router.delete(ENDPOINTS.SCHEDULE.SUBTASK_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_subtask(
    schedule_task_id: int,
    subtask_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    schedule_subtask_service.delete_subtask(db, current_user, schedule_task_id, subtask_id)
