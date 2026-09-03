from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.habits import HabitCreateRequest, HabitDataResponse, HabitHistoryResponse, HabitStatus, HabitUpdateRequest
from app.services import habits_service

router = APIRouter(prefix=ENDPOINTS.HABITS.PREFIX, tags=["Habits"])


@router.get(ENDPOINTS.HABITS.GET_LIST, response_model=list[HabitDataResponse])
def get_habit_list(
    status: HabitStatus | None = None,
    goal_id: int | None = None,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[HabitDataResponse]:
    return habits_service.get_list(db, current_user, status=status, goal_id=goal_id)


@router.post(
    ENDPOINTS.HABITS.SAVE,
    response_model=HabitDataResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_habit(
    data: HabitCreateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> HabitDataResponse:
    return habits_service.save_habit(db, current_user, data)


@router.get(ENDPOINTS.HABITS.HISTORY, response_model=HabitHistoryResponse)
def get_habit_history(
    habit_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> HabitHistoryResponse:
    return habits_service.get_history(db, current_user, habit_id, skip=skip, limit=limit)


@router.patch(ENDPOINTS.HABITS.DETAIL, response_model=HabitDataResponse)
def update_habit(
    habit_id: int,
    data: HabitUpdateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> HabitDataResponse:
    return habits_service.update_habit(db, current_user, habit_id, data)


@router.delete(ENDPOINTS.HABITS.DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(
    habit_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    habits_service.delete_habit(db, current_user, habit_id)
