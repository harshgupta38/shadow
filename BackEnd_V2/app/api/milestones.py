from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import User
from app.schemas.milestones import (
    MilestoneCreateRequest,
    MilestoneUpdateRequest,
    MilestoneStatus,
    MilestoneResponse,
)
from app.services import milestones_service

router = APIRouter(prefix=ENDPOINTS.MILESTONES.PREFIX, tags=["Milestones"])


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


@router.get(ENDPOINTS.MILESTONES.GET_LIST, response_model=list[MilestoneResponse])
def get_milestone_list(
    goal_id: int,
    status: MilestoneStatus | None = None,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MilestoneResponse]:
    return milestones_service.get_milestone_list(db, current_user, goal_id, status)


@router.get(ENDPOINTS.MILESTONES.DETAIL, response_model=MilestoneResponse)
def get_milestone_detail(
    milestone_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MilestoneResponse:
    return milestones_service.get_milestone_detail(db, current_user, milestone_id)


@router.patch(ENDPOINTS.MILESTONES.DETAIL, response_model=MilestoneResponse)
def update_milestone(
    milestone_id: int,
    data: MilestoneUpdateRequest,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MilestoneResponse:
    return milestones_service.update_milestone(db, current_user, milestone_id, data)


@router.delete(ENDPOINTS.MILESTONES.DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(
    milestone_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    milestones_service.delete_milestone(db, current_user, milestone_id)
