from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.schemas.milestones import (
    MilestoneCreateRequest,
    MilestoneStatus,
    MilestoneResponse,
)
from app.services import milestones_service

router = APIRouter(prefix=ENDPOINTS.MILESTONES.PREFIX, tags=["Milestones"])


@router.get(
    ENDPOINTS.MILESTONES.GET_LIST, response_model=list[MilestoneResponse]
)
def get_milestone_list(
    goal_id: int,
    milestone_status: MilestoneStatus | None = None,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MilestoneResponse]:
    return milestones_service.get_milestone_list(
        db, current_user, goal_id, milestone_status
    )


@router.post(
    ENDPOINTS.MILESTONES.SAVE,
    response_model=MilestoneResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_milestone(
    data: MilestoneCreateRequest,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MilestoneResponse:
    return milestones_service.save_milestone(db, current_user, data)
