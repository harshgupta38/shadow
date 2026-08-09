from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.goal import Goal
from app.models.milestone import Milestone
from app.models.user import User
from app.schemas.milestones import (
    MilestoneCreateRequest,
    MilestoneResponse,
    MilestoneStatus,
    MilestoneUpdateRequest,
)


def _serialize_milestone(milestone: Milestone) -> MilestoneResponse:
    return MilestoneResponse(
        id=milestone.id,
        goal_id=milestone.goal_id,
        title=milestone.title,
        description=milestone.description,
        status=milestone.status,
        reason=milestone.reason,
        estimated_duration_days=milestone.estimated_duration_days,
        started_at=milestone.started_at,
        paused_at=milestone.paused_at,
        target_date=milestone.target_date,
        completed_at=milestone.completed_at,
        position=milestone.position,
        created_at=milestone.created_at,
        created_by=milestone.created_by,
        assistant_context=milestone.assistant_context,
        total_tasks=milestone.total_tasks,
        completed_tasks=milestone.completed_tasks,
    )


def save_milestone(
    db: Session, current_user: User, data: MilestoneCreateRequest
) -> MilestoneResponse:

    goal = db.scalar(
        select(Goal).where(
            Goal.id == data.goal_id,
            Goal.user_id == current_user.id,
        )
    )

    if goal is None:
        raise NotFoundError("Goal not found. Please check the goal and try again.")

    next_position = db.scalar(
        select(func.coalesce(func.max(Milestone.position), -1) + 1).where(
            Milestone.goal_id == goal.id,
        )
    )

    milestone = Milestone(
        goal_id=goal.id,
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
    current_user: User,
    goal_id: int,
    status: MilestoneStatus | None,
) -> list[MilestoneResponse]:

    goal = db.scalar(
        select(Goal).where(
            Goal.id == goal_id,
            Goal.user_id == current_user.id,
        )
    )

    if goal is None:
        raise NotFoundError("Goal not found. Please check the goal and try again.")

    query = select(Milestone).where(Milestone.goal_id == goal_id)

    if status is not None:
        query = query.where(Milestone.status == status)

    query = query.order_by(Milestone.position)

    milestones = db.scalars(query).all()

    return [_serialize_milestone(milestone) for milestone in milestones]


def get_milestone_detail(
    db: Session, current_user: User, milestone_id: int
) -> MilestoneResponse:
    milestone = db.scalar(
        select(Milestone)
        .join(Goal, Milestone.goal_id == Goal.id)
        .where(
            Milestone.id == milestone_id,
            Goal.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError(
            "Milestone not found. Please check and try again."
        )

    return _serialize_milestone(milestone)


def update_milestone(
    db: Session, current_user: User, milestone_id: int, data: MilestoneUpdateRequest
) -> MilestoneResponse:
    from app.schemas.milestones import MilestoneUpdateRequest as _MUR  # noqa: F401
    from datetime import datetime, timezone

    milestone = db.scalar(
        select(Milestone)
        .join(Goal, Milestone.goal_id == Goal.id)
        .where(
            Milestone.id == milestone_id,
            Goal.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError(
            "Milestone not found. Please check and try again."
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
    if data.target_date is not None:
        milestone.target_date = data.target_date
    if data.position is not None:
        milestone.position = data.position
    if data.status is not None:
        prev_status = milestone.status
        milestone.status = data.status
        now = datetime.now(timezone.utc)
        if data.status == "In Progress" and prev_status not in (
            "In Progress",
            "Paused",
        ):
            milestone.started_at = milestone.started_at or now
        elif data.status == "Paused":
            milestone.paused_at = now
        elif data.status == "Completed":
            milestone.completed_at = now

    db.commit()
    db.refresh(milestone)
    return _serialize_milestone(milestone)


def delete_milestone(
    db: Session, current_user: User, milestone_id: int
) -> None:
    milestone = db.scalar(
        select(Milestone)
        .join(Goal, Milestone.goal_id == Goal.id)
        .where(
            Milestone.id == milestone_id,
            Goal.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError("Milestone not found. Please check and try again.")

    goal = db.scalar(select(Goal).where(Goal.id == milestone.goal_id))

    db.delete(milestone)
    if goal is not None:
        goal.milestones_total = max(0, (goal.milestones_total or 1) - 1)
        if milestone.status == "Completed":
            goal.milestones_completed = max(0, (goal.milestones_completed or 1) - 1)
    db.commit()
