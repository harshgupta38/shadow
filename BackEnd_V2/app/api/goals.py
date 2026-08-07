from fastapi import APIRouter

from app.core.endpoints import ENDPOINTS
from app.schemas.goals import UnderstandGoalRequest, UnderstandGoalResponse
from app.services import goals_service

router = APIRouter(prefix=ENDPOINTS.GOALS.PREFIX, tags=["Goals"])


@router.post(ENDPOINTS.GOALS.REFINE, response_model=UnderstandGoalResponse)
def understand_goal(data: UnderstandGoalRequest) -> UnderstandGoalResponse:
    return goals_service.understand_goal(data)