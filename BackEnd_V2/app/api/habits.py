from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.habits import (
    HabitActivityResponse,
    HabitCreateRequest,
    HabitDataResponse,
    HabitStatus,
    HabitUpdateRequest,
)
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


@router.get(ENDPOINTS.HABITS.ACTIVITY, response_model=HabitActivityResponse)
def get_habit_activity(
    habit_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> HabitActivityResponse:
    return habits_service.get_activity(db, current_user, habit_id)


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
