from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.schemas.goals import UnderstandGoalRequest, UnderstandGoalResponse
from app.services import goals_service

router = APIRouter(prefix=ENDPOINTS.GOALS.PREFIX, tags=["Goals"])


@router.post(ENDPOINTS.GOALS.REFINE, response_model=UnderstandGoalResponse)
def understand_goal(data: UnderstandGoalRequest) -> UnderstandGoalResponse:
    return goals_service.understand_goal(data)


@router.post(ENDPOINTS.GOALS.SAVE, response_model=UnderstandGoalResponse)
def save_goal(
    data: UnderstandGoalResponse,
    db = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnderstandGoalResponse:
    return goals_service.save_goal(db, current_user, data)