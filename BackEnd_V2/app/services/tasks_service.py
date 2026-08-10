from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.exceptions import ValidationError
from app.models.goal import Goal
from app.models.milestone import Milestone
from app.models.task import Task
from app.models.user import User
from app.schemas.tasks import TaskCreateRequest, TaskResponse, TaskUpdateRequest


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
        raise NotFoundError(
            "Milestone not found. Please check the goal and milestone and try again."
        )

    if data.task_type == "Numeric" and data.planning_enabled:
        today = date.today()
        effective_start = data.planning_start_date
        if data.start_with_milestone:
            effective_start = (
                milestone.started_at.date()
                if milestone.started_at is not None
                else today
            )

        effective_end = data.planning_end_date
        if data.end_with_milestone:
            if milestone.target_date is None:
                raise ValidationError(
                    "Please correct the highlighted fields.",
                    errors={
                        "planning_end_date": "Milestone target date is required when end_with_milestone is true."
                    },
                )
            effective_end = milestone.target_date

        if (
            effective_start is not None
            and effective_end is not None
            and effective_end < effective_start
        ):
            raise ValidationError(
                "Please correct the highlighted fields.",
                errors={
                    "planning_end_date": "Planning end date must be on or after planning start date."
                },
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
        note=(
            data.note.strip()
            if isinstance(data.note, str) and data.note.strip()
            else None
        ),
        position=int(next_position or 0),
        created_by="User",
    )

    db.add(task)

    milestone.total_tasks = (milestone.total_tasks or 0) + 1

    db.commit()
    db.refresh(task)

    return _serialize_task(task)


def get_list(db: Session, current_user: User, milestone_id: int) -> list[TaskResponse]:
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
            "Milestone not found. Please check the milestone and try again."
        )

    tasks = db.scalars(
        select(Task)
        .where(Task.milestone_id == milestone.id)
        .order_by(Task.position.asc(), Task.id.asc())
    ).all()

    return [_serialize_task(task) for task in tasks]


def update_task(
    db: Session,
    current_user: User,
    task_id: int,
    data: TaskUpdateRequest,
) -> TaskResponse:
    task = db.scalar(
        select(Task)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Goal, Milestone.goal_id == Goal.id)
        .where(
            Task.id == task_id,
            Goal.user_id == current_user.id,
        )
    )

    if task is None:
        raise NotFoundError("Task not found. Please check and try again.")

    if data.status is not None and task.task_type == "Binary":
        if data.status not in {"Not Started", "Completed", "Cancelled"}:
            raise ValidationError(
                "Please correct the highlighted fields.",
                errors={"status": "Binary tasks only support status: Not Started, Completed, Cancelled."},
            )

    if data.title is not None:
        task.title = data.title.strip()

    if data.status is not None:
        task.status = data.status

    if data.current_value is not None:
        task.current_value = data.current_value

    if data.target_value is not None:
        task.target_value = data.target_value

    if "value_unit" in data.model_fields_set:
        task.value_unit = (
            data.value_unit.strip()
            if isinstance(data.value_unit, str) and data.value_unit.strip()
            else None
        )

    if "planning_enabled" in data.model_fields_set and data.planning_enabled is not None:
        task.planning_enabled = data.planning_enabled

    if "planning_method" in data.model_fields_set:
        task.planning_method = data.planning_method

    if "planner_target" in data.model_fields_set:
        task.planner_target = data.planner_target

    if "planning_start_date" in data.model_fields_set:
        task.planning_start_date = data.planning_start_date

    if "start_with_milestone" in data.model_fields_set and data.start_with_milestone is not None:
        task.start_with_milestone = data.start_with_milestone

    if "planning_end_date" in data.model_fields_set:
        task.planning_end_date = data.planning_end_date

    if "end_with_milestone" in data.model_fields_set and data.end_with_milestone is not None:
        task.end_with_milestone = data.end_with_milestone

    if "note" in data.model_fields_set:
        task.note = (
            data.note.strip()
            if isinstance(data.note, str) and data.note.strip()
            else None
        )

    if data.position is not None:
        task.position = data.position

    db.commit()
    db.refresh(task)

    return _serialize_task(task)


def delete_task(db: Session, current_user: User, task_id: int) -> None:
    task = db.scalar(
        select(Task)
        .join(Milestone, Task.milestone_id == Milestone.id)
        .join(Goal, Milestone.goal_id == Goal.id)
        .where(
            Task.id == task_id,
            Goal.user_id == current_user.id,
        )
    )

    if task is None:
        raise NotFoundError("Task not found. Please check and try again.")

    milestone = db.scalar(select(Milestone).where(Milestone.id == task.milestone_id))

    db.delete(task)

    if milestone is not None:
        milestone.total_tasks = max(0, (milestone.total_tasks or 1) - 1)
        if task.status == "Completed":
            milestone.completed_tasks = max(0, (milestone.completed_tasks or 1) - 1)

    db.commit()
