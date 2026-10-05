from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AppError
from app.models.schedule_task import ScheduledTaskDBM
from app.models.scheduled_task_subtask import ScheduledTaskSubtaskDBM
from app.models.user import UserDBM
from app.schemas.schedule import SubtaskCreateRequest, SubtaskResponse, SubtaskUpdateRequest


def _get_long_task(db: Session, current_user: UserDBM, task_id: int) -> ScheduledTaskDBM:
    task = db.scalar(
        select(ScheduledTaskDBM).where(
            ScheduledTaskDBM.id == task_id,
            ScheduledTaskDBM.user_id == current_user.id,
        )
    )
    if task is None:
        raise AppError("Scheduled task not found.", status_code=404)
    if task.task_duration != "long":
        raise AppError("Sub-tasks are only available for long-term tasks.", status_code=400)
    return task


def _serialize(subtask: ScheduledTaskSubtaskDBM) -> SubtaskResponse:
    return SubtaskResponse(
        id=subtask.id,
        task_id=subtask.task_id,
        subtask_date=subtask.subtask_date,
        description=subtask.description,
        planner_mode=subtask.planner_mode,
        created_at=subtask.created_at,
        updated_at=subtask.updated_at,
    )


def list_subtasks(db: Session, current_user: UserDBM, task_id: int) -> list[SubtaskResponse]:
    _get_long_task(db, current_user, task_id)
    rows = list(db.scalars(
        select(ScheduledTaskSubtaskDBM)
        .where(
            ScheduledTaskSubtaskDBM.task_id == task_id,
            ScheduledTaskSubtaskDBM.user_id == current_user.id,
        )
        .order_by(ScheduledTaskSubtaskDBM.subtask_date, ScheduledTaskSubtaskDBM.id)
    ).all())
    return [_serialize(s) for s in rows]


def create_subtask(
    db: Session,
    current_user: UserDBM,
    task_id: int,
    data: SubtaskCreateRequest,
) -> SubtaskResponse:
    task = _get_long_task(db, current_user, task_id)
    if data.subtask_date < task.scheduled_date:
        raise AppError("subtask_date cannot be before the task's start date.", status_code=400)
    if task.end_date and data.subtask_date > task.end_date:
        raise AppError("subtask_date cannot be after the task's end date.", status_code=400)
    subtask = ScheduledTaskSubtaskDBM(
        task_id=task_id,
        user_id=current_user.id,
        subtask_date=data.subtask_date,
        description=data.description.strip(),
        planner_mode=data.planner_mode,
    )
    db.add(subtask)
    db.commit()
    db.refresh(subtask)
    return _serialize(subtask)


def update_subtask(
    db: Session,
    current_user: UserDBM,
    task_id: int,
    subtask_id: int,
    data: SubtaskUpdateRequest,
) -> SubtaskResponse:
    _get_long_task(db, current_user, task_id)
    subtask = db.scalar(
        select(ScheduledTaskSubtaskDBM).where(
            ScheduledTaskSubtaskDBM.id == subtask_id,
            ScheduledTaskSubtaskDBM.task_id == task_id,
            ScheduledTaskSubtaskDBM.user_id == current_user.id,
        )
    )
    if subtask is None:
        raise AppError("Sub-task not found.", status_code=404)
    fields = data.model_fields_set
    if "description" in fields and data.description is not None:
        subtask.description = data.description.strip()
    if "planner_mode" in fields:
        subtask.planner_mode = data.planner_mode
    db.commit()
    db.refresh(subtask)
    return _serialize(subtask)


def delete_subtask(
    db: Session,
    current_user: UserDBM,
    task_id: int,
    subtask_id: int,
) -> None:
    _get_long_task(db, current_user, task_id)
    subtask = db.scalar(
        select(ScheduledTaskSubtaskDBM).where(
            ScheduledTaskSubtaskDBM.id == subtask_id,
            ScheduledTaskSubtaskDBM.task_id == task_id,
            ScheduledTaskSubtaskDBM.user_id == current_user.id,
        )
    )
    if subtask is None:
        raise AppError("Sub-task not found.", status_code=404)
    db.delete(subtask)
    db.commit()
