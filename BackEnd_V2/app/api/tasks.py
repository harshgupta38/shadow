from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.schemas.tasks import TaskCreateRequest, TaskResponse
from app.services import tasks_service

router = APIRouter(prefix=ENDPOINTS.TASKS.PREFIX, tags=["Tasks"])


@router.post(
    ENDPOINTS.TASKS.SAVE,
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_task(
    data: TaskCreateRequest,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TaskResponse:
    return tasks_service.save_task(db, current_user, data)


@router.get(
    ENDPOINTS.TASKS.GET_LIST,
    response_model=list[TaskResponse],
)
def get_task_list(
    milestone_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TaskResponse]:
    return tasks_service.get_list(db, current_user, milestone_id)