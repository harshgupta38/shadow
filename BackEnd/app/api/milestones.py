"""Milestone routes (update/delete a milestone directly)."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.milestone import MilestoneRead, MilestoneUpdate
from app.services import goal_service

router = APIRouter(prefix="/milestones", tags=["milestones"])


@router.put("/{milestone_id}", response_model=MilestoneRead)
def update_milestone(
    milestone_id: int, data: MilestoneUpdate, db: DbSession, current_user: CurrentUser
) -> MilestoneRead:
    return goal_service.update_milestone(db, current_user, milestone_id, data)


@router.delete("/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(milestone_id: int, db: DbSession, current_user: CurrentUser) -> None:
    goal_service.delete_milestone(db, current_user, milestone_id)
