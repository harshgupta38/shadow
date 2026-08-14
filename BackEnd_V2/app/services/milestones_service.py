from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from app.core.exceptions import NotFoundError
from app.models.goal import GoalDBM
from app.models.milestone import MilestoneDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.schemas.milestones import (
    MilestoneCreateRequest,
    MilestoneDataResponse,
    MilestoneStatus,
    MilestoneUpdateRequest,
)


def _serialize_milestone(milestone: MilestoneDBM) -> MilestoneDataResponse:
    return MilestoneDataResponse.model_validate(milestone)


def save_milestone(
    db: Session, current_user: UserDBM, data: MilestoneCreateRequest
) -> MilestoneDataResponse:

    goal = db.scalar(
        select(GoalDBM).where(
            GoalDBM.id == data.goal_id,
            GoalDBM.user_id == current_user.id,
        )
    )

    if goal is None:
        raise NotFoundError("Goal not found. Please check the goal and try again.")

    next_position = db.scalar(
        select(func.coalesce(func.max(MilestoneDBM.position), -1) + 1).where(
            MilestoneDBM.goal_id == goal.id,
        )
    )

    milestone = MilestoneDBM(
        goal_id=goal.id,
        user_id=current_user.id,
        title=data.title.strip(),
        description=(
            data.description.strip()
            if isinstance(data.description, str) and data.description.strip()
            else None
        ),
        status="Not Started",
        reason=data.reason.strip(),
        estimated_duration_days=data.estimated_duration_days,
        position=int(next_position or 0),
        created_by=data.created_by,
        assistant_context=data.assistant_context,
        total_tasks=0,
        completed_tasks=0,
    )

    db.add(milestone)
    goal.milestones_total = (goal.milestones_total or 0) + 1
    db.commit()
    db.refresh(milestone)

    return _serialize_milestone(milestone)


def get_milestone_list(
    db: Session,
    current_user: UserDBM,
    goal_id: int,
    status: MilestoneStatus | None,
) -> list[MilestoneDataResponse]:

    goal = db.scalar(
        select(GoalDBM).where(
            GoalDBM.id == goal_id,
            GoalDBM.user_id == current_user.id,
        )
    )

    if goal is None:
        raise NotFoundError("Goal not found. Please check the goal and try again.")

    query = select(MilestoneDBM).where(
        MilestoneDBM.goal_id == goal_id,
        MilestoneDBM.user_id == current_user.id,
    )

    if status is not None:
        query = query.where(MilestoneDBM.status == status)

    query = query.order_by(MilestoneDBM.position)

    milestones = db.scalars(query).all()

    return [_serialize_milestone(milestone) for milestone in milestones]


def get_milestone_detail(
    db: Session, current_user: UserDBM, milestone_id: int
) -> MilestoneDataResponse:
    milestone = db.scalar(
        select(MilestoneDBM).where(
            MilestoneDBM.id == milestone_id,
            MilestoneDBM.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError(
            "Milestone not found. Please check and try again."
        )

    return _serialize_milestone(milestone)


def update_milestone(
    db: Session, current_user: UserDBM, milestone_id: int, data: MilestoneUpdateRequest
) -> MilestoneDataResponse:

    milestone = db.scalar(
        select(MilestoneDBM).where(
            MilestoneDBM.id == milestone_id,
            MilestoneDBM.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError(
            "Milestone not found. Please check and try again."
        )

    goal = db.scalar(
        select(GoalDBM).where(
            GoalDBM.id == milestone.goal_id,
            GoalDBM.user_id == current_user.id,
        )
    )

    if data.title is not None:
        milestone.title = data.title.strip()
    if data.description is not None:
        stripped = data.description.strip()
        milestone.description = stripped if stripped else None
    if data.reason is not None:
        milestone.reason = data.reason.strip()
    if data.estimated_duration_days is not None:
        milestone.estimated_duration_days = data.estimated_duration_days
    if "target_date" in data.model_fields_set:
        milestone.target_date = data.target_date
    if data.position is not None:
        milestone.position = data.position
    if data.status is not None:
        prev_status = milestone.status
        milestone.status = data.status
        if goal is not None:
            if prev_status != "Completed" and data.status == "Completed":
                goal.milestones_completed = (goal.milestones_completed or 0) + 1
            elif prev_status == "Completed" and data.status != "Completed":
                goal.milestones_completed = max(0, (goal.milestones_completed or 1) - 1)
        now = datetime.now(timezone.utc)
        if data.status == "Cancelled":
            milestone.cancelled_at = now
        elif prev_status == "Cancelled":
            milestone.cancelled_at = None
        if data.status == "In Progress" and prev_status not in (
            "In Progress",
            "Paused",
        ):
            milestone.started_at = milestone.started_at or now
            # TODO send notification that we have set the target_date
            if (
                prev_status == "Not Started"
                and milestone.target_date is None
                and (milestone.estimated_duration_days or 0) > 0
            ):
                milestone.target_date = (
                    now.date() + timedelta(days=milestone.estimated_duration_days)
                )
        elif data.status == "Paused":
            milestone.paused_at = now
        elif data.status == "Completed":
            milestone.completed_at = now

    db.commit()
    db.refresh(milestone)
    return _serialize_milestone(milestone)


def delete_milestone(
    db: Session, current_user: UserDBM, milestone_id: int
) -> None:
    milestone = db.scalar(
        select(MilestoneDBM).where(
            MilestoneDBM.id == milestone_id,
            MilestoneDBM.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError("Milestone not found. Please check and try again.")

    goal = db.scalar(select(GoalDBM).where(GoalDBM.id == milestone.goal_id))

    db.execute(delete(TaskDBM).where(TaskDBM.milestone_id == milestone.id))

    db.delete(milestone)
    if goal is not None:
        goal.milestones_total = max(0, (goal.milestones_total or 1) - 1)
        if milestone.status == "Completed":
            goal.milestones_completed = max(0, (goal.milestones_completed or 1) - 1)
    db.commit()
