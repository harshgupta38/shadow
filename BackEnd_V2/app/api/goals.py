from fastapi import APIRouter, Depends, status as http_status

from app.llm import RefineGoalFromLLM
from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.goals import (
    GoalDataResponse,
    GoalDataShortResponse,
    GoalListStatusFilter,
    SaveGoalRequest,
    RefineGoalRequest,
)
from app.services import goals_service

router = APIRouter(prefix=ENDPOINTS.GOALS.PREFIX, tags=["Goals"])


@router.post(
    ENDPOINTS.GOALS.REFINE,
    response_model=RefineGoalFromLLM,
)
async def refine_goal(
    data: RefineGoalRequest,
    current_user: UserDBM = Depends(get_current_user),
) -> RefineGoalFromLLM:
    return await goals_service.refine_goal(data, current_user)


@router.post(ENDPOINTS.GOALS.SAVE, status_code=http_status.HTTP_204_NO_CONTENT)
def save_goal(
    data: SaveGoalRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    goals_service.save_goal(db, current_user, data)


@router.get(ENDPOINTS.GOALS.GET_LIST, response_model=list[GoalDataShortResponse])
def get_goal_list(
    status: GoalListStatusFilter = "All",
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[GoalDataShortResponse]:
    return goals_service.get_goal_list(db, current_user, status)


@router.get(ENDPOINTS.GOALS.DETAIL, response_model=GoalDataResponse)
def get_goal_detail(
    goal_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> GoalDataResponse:
    return goals_service.get_goal_detail(db, current_user, goal_id)


@router.delete(ENDPOINTS.GOALS.DETAIL, status_code=http_status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    goals_service.delete_goal(db, current_user, goal_id)


@router.patch(ENDPOINTS.GOALS.DETAIL, response_model=GoalDataResponse)
def update_goal(
    goal_id: int,
    data: SaveGoalRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> GoalDataResponse:
    return goals_service.update_goal(db, current_user, goal_id, data)
