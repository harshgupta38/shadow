from fastapi import APIRouter, Depends, status as http_status

from app.llm.models import RefineGoalResponse
from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.schemas.goals import (
    GoalDetailResponse,
    GoalListItemResponse,
    GoalListStatusFilter,
    UnderstandGoalRequest,
    UnderstandGoalResponse,
)
from app.services import goals_service

router = APIRouter(prefix=ENDPOINTS.GOALS.PREFIX, tags=["Goals"])


@router.post(ENDPOINTS.GOALS.REFINE, response_model=RefineGoalResponse)
async def understand_goal(
    data: UnderstandGoalRequest,
    current_user: User = Depends(get_current_user),
) -> RefineGoalResponse:
    return await goals_service.understand_goal(data, current_user)


@router.post(ENDPOINTS.GOALS.SAVE, response_model=UnderstandGoalResponse)
def save_goal(
    data: UnderstandGoalResponse,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnderstandGoalResponse:
    return goals_service.save_goal(db, current_user, data)


@router.get(ENDPOINTS.GOALS.GET_LIST, response_model=list[GoalListItemResponse])
def get_goal_list(
    status: GoalListStatusFilter = "All",
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GoalListItemResponse]:
    return goals_service.get_goal_list(db, current_user, status)


@router.get(ENDPOINTS.GOALS.DETAIL, response_model=GoalDetailResponse)
def get_goal_detail(
    goal_id: int,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalDetailResponse:
    return goals_service.get_goal_detail(db, current_user, goal_id)


@router.delete(ENDPOINTS.GOALS.DETAIL, status_code=http_status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    goals_service.delete_goal(db, current_user, goal_id)


@router.patch(ENDPOINTS.GOALS.DETAIL, response_model=GoalDetailResponse)
def update_goal(
    goal_id: int,
    data: UnderstandGoalResponse,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GoalDetailResponse:
    return goals_service.update_goal(db, current_user, goal_id, data)