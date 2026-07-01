"""Goal & milestone routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.models.enums import GoalStatus
from app.schemas.goal import GoalCreate, GoalRead, GoalUpdate
from app.schemas.milestone import MilestoneCreate, MilestoneRead
from app.services import goal_service

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("", response_model=list[GoalRead])
def list_goals(
    db: DbSession, current_user: CurrentUser, status: GoalStatus | None = None
) -> list[GoalRead]:
    return goal_service.list_goals(db, current_user, status=status)


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
def create_goal(data: GoalCreate, db: DbSession, current_user: CurrentUser) -> GoalRead:
    return goal_service.create_goal(db, current_user, data)


@router.get("/{goal_id}", response_model=GoalRead)
def get_goal(goal_id: int, db: DbSession, current_user: CurrentUser) -> GoalRead:
    return goal_service.get_goal(db, current_user, goal_id)


@router.put("/{goal_id}", response_model=GoalRead)
def update_goal(
    goal_id: int, data: GoalUpdate, db: DbSession, current_user: CurrentUser
) -> GoalRead:
    return goal_service.update_goal(db, current_user, goal_id, data)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, db: DbSession, current_user: CurrentUser) -> None:
    goal_service.delete_goal(db, current_user, goal_id)


@router.get("/{goal_id}/milestones", response_model=list[MilestoneRead])
def list_milestones(goal_id: int, db: DbSession, current_user: CurrentUser) -> list[MilestoneRead]:
    return goal_service.list_milestones(db, current_user, goal_id)


@router.post(
    "/{goal_id}/milestones",
    response_model=MilestoneRead,
    status_code=status.HTTP_201_CREATED,
)
def add_milestone(
    goal_id: int, data: MilestoneCreate, db: DbSession, current_user: CurrentUser
) -> MilestoneRead:
    return goal_service.add_milestone(db, current_user, goal_id, data)
