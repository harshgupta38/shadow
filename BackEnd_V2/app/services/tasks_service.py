from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.exceptions import ValidationError
from app.models.goal import Goal
from app.models.milestone import Milestone
from app.models.task import Task
from app.models.user import User
from app.schemas.tasks import TaskCreateRequest, TaskResponse


def _serialize_task(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        goal_id=task.goal_id,
        milestone_id=task.milestone_id,
        title=task.title,
        task_type=task.task_type,
        current_value=task.current_value,
        target_value=task.target_value,
        value_unit=task.value_unit,
        status=task.status,
        planning_enabled=task.planning_enabled,
        planning_method=task.planning_method,
        planner_target=task.planner_target,
        planning_start_date=task.planning_start_date,
        start_with_milestone=task.start_with_milestone,
        planning_end_date=task.planning_end_date,
        end_with_milestone=task.end_with_milestone,
        assistant_context=task.assistant_context,
        note=task.note,
        position=task.position,
        created_at=task.created_at,
        created_by=task.created_by,
        started_at=task.started_at,
        paused_at=task.paused_at,
        completed_at=task.completed_at,
        cancelled_at=task.cancelled_at,
    )


def save_task(db: Session, current_user: User, data: TaskCreateRequest) -> TaskResponse:
    milestone = db.scalar(
        select(Milestone)
        .join(Goal, Milestone.goal_id == Goal.id)
        .where(
            Milestone.id == data.milestone_id,
            Milestone.goal_id == data.goal_id,
            Goal.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError("Milestone not found. Please check the goal and milestone and try again.")

    if data.task_type == "Numeric" and data.planning_enabled:
        today = date.today()
        effective_start = data.planning_start_date
        if data.start_with_milestone:
            effective_start = milestone.started_at.date() if milestone.started_at is not None else today

        effective_end = data.planning_end_date
        if data.end_with_milestone:
            if milestone.target_date is None:
                raise ValidationError(
                    "Please correct the highlighted fields.",
                    errors={"planning_end_date": "Milestone target date is required when end_with_milestone is true."},
                )
            effective_end = milestone.target_date

        if effective_start is not None and effective_end is not None and effective_end < effective_start:
            raise ValidationError(
                "Please correct the highlighted fields.",
                errors={"planning_end_date": "Planning end date must be on or after planning start date."},
            )

    next_position = db.scalar(
        select(func.coalesce(func.max(Task.position), -1) + 1).where(
            Task.milestone_id == milestone.id,
        )
    )

    task = Task(
        goal_id=data.goal_id,
        milestone_id=milestone.id,
        title=data.title.strip(),
        task_type=data.task_type,
        current_value=data.current_value,
        target_value=data.target_value,
        value_unit=(
            data.value_unit.strip()
            if isinstance(data.value_unit, str) and data.value_unit.strip()
            else None
        ),
        status="Not Started",
        planning_enabled=data.planning_enabled,
        planning_method=data.planning_method,
        planner_target=data.planner_target,
        planning_start_date=data.planning_start_date,
        start_with_milestone=data.start_with_milestone,
        planning_end_date=data.planning_end_date,
        end_with_milestone=data.end_with_milestone,
        assistant_context=data.assistant_context,
        note=(data.note.strip() if isinstance(data.note, str) and data.note.strip() else None),
        position=int(next_position or 0),
        created_by="User",
    )

    db.add(task)

    milestone.total_tasks = (milestone.total_tasks or 0) + 1

    db.commit()
    db.refresh(task)

    return _serialize_task(task)