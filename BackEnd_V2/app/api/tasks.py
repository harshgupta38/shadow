from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.tasks import TaskCreateRequest, TaskDataResponse, TaskUpdateRequest
from app.services import tasks_service

router = APIRouter(prefix=ENDPOINTS.TASKS.PREFIX, tags=["Tasks"])


@router.post(
    ENDPOINTS.TASKS.SAVE,
    response_model=TaskDataResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_task(
    data: TaskCreateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> TaskDataResponse:
    return tasks_service.save_task(db, current_user, data)


@router.get(
    ENDPOINTS.TASKS.GET_LIST,
    response_model=list[TaskDataResponse],
)
def get_task_list(
    milestone_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[TaskDataResponse]:
    return tasks_service.get_list(db, current_user, milestone_id)


@router.patch(
    ENDPOINTS.TASKS.DETAIL,
    response_model=TaskDataResponse,
)
def update_task(
    task_id: int,
    data: TaskUpdateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> TaskDataResponse:
    return tasks_service.update_task(db, current_user, task_id, data)


@router.delete(ENDPOINTS.TASKS.DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    tasks_service.delete_task(db, current_user, task_id)
