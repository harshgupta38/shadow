from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.core.exceptions import ValidationError
from app.models.chat import MessageDBM
from app.models.milestone import MilestoneDBM
from app.models.task import TaskDBM
from app.models.task_proposal import TaskProposalDBM
from app.models.user import UserDBM
from app.schemas.tasks import TaskCreateRequest, TaskDataResponse, TaskUpdateRequest, SaveTaskFromProposalRequest


def _serialize_task(task: TaskDBM) -> TaskDataResponse:
    return TaskDataResponse.model_validate(task)


def _find_task(db: Session, current_user: UserDBM, task_id: int | None) -> TaskDBM | None:
    if task_id is None:
        return None
    return db.scalar(
        select(TaskDBM).where(
            TaskDBM.id == task_id,
            TaskDBM.user_id == current_user.id,
        )
    )


def _mark_task_proposal_saved_in_message(
    db: Session, message_id: int, proposal_id: str, task_id: int
) -> None:
    message = db.get(MessageDBM, message_id)
    if message is None:
        return
    linked_items = message.linked_items or {}
    proposals = linked_items.get("task_proposals") or []
    updated_proposals = [
        (
            {**proposal, "status": "saved", "task_id": task_id}
            if proposal.get("proposal_id") == proposal_id
            else proposal
        )
        for proposal in proposals
    ]
    message.linked_items = {**linked_items, "task_proposals": updated_proposals}


def save_task_from_proposal(db: Session, current_user: UserDBM, data: SaveTaskFromProposalRequest) -> TaskDataResponse:
    proposal = db.scalar(
        select(TaskProposalDBM).where(TaskProposalDBM.proposal_id == data.proposal_id)
    )

    if proposal is None or proposal.user_id != current_user.id:
        raise NotFoundError("Task proposal not found.")

    existing_task = _find_task(db, current_user, proposal.task_id)
    if existing_task is not None:
        return _serialize_task(existing_task)

    milestone = db.scalar(
        select(MilestoneDBM).where(
            MilestoneDBM.id == proposal.milestone_id,
            MilestoneDBM.user_id == current_user.id,
        )
    )
    if milestone is None:
        raise NotFoundError("The milestone for this task proposal no longer exists.")

    stale_task_id = proposal.task_id

    task_data = data.task

    next_position = db.scalar(
        select(func.coalesce(func.max(TaskDBM.position), -1) + 1).where(
            TaskDBM.milestone_id == milestone.id,
        )
    )

    task = TaskDBM(
        goal_id=milestone.goal_id,
        milestone_id=milestone.id,
        user_id=current_user.id,
        title=task_data.title.strip(),
        task_type=task_data.task_type,
        status="Not Started",
        current_value=task_data.current_value,
        target_value=task_data.target_value,
        value_unit=task_data.value_unit.strip() if task_data.value_unit else None,
        planning_enabled=task_data.planning_enabled,
        planning_method=task_data.planning_method,
        planner_target=task_data.planner_target,
        position=int(next_position or 0),
        created_by="Assistant",
        note=task_data.note,
        assistant_context=task_data.assistant_context,
    )
    db.add(task)
    db.flush()

    result = db.execute(
        update(TaskProposalDBM)
        .where(
            TaskProposalDBM.proposal_id == data.proposal_id,
            TaskProposalDBM.task_id == stale_task_id,
        )
        .values(status="saved", task_id=task.id)
    )

    if result.rowcount == 0:
        db.rollback()
        proposal = db.scalar(
            select(TaskProposalDBM).where(TaskProposalDBM.proposal_id == data.proposal_id)
        )
        existing_task = _find_task(db, current_user, proposal.task_id if proposal else None)
        if existing_task is None:
            raise ConflictError("Task proposal could not be resolved.")
        return _serialize_task(existing_task)

    milestone.total_tasks = (milestone.total_tasks or 0) + 1
    _mark_task_proposal_saved_in_message(db, proposal.message_id, data.proposal_id, task.id)

    db.commit()
    db.refresh(task)

    return _serialize_task(task)


def save_task(db: Session, current_user: UserDBM, data: TaskCreateRequest) -> TaskDataResponse:
    milestone = db.scalar(
        select(MilestoneDBM).where(
            MilestoneDBM.id == data.milestone_id,
            MilestoneDBM.goal_id == data.goal_id,
            MilestoneDBM.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError(
            "Milestone not found. Please check the goal and milestone and try again."
        )

    next_position = db.scalar(
        select(func.coalesce(func.max(TaskDBM.position), -1) + 1).where(
            TaskDBM.milestone_id == milestone.id,
        )
    )

    task = TaskDBM(
        goal_id=data.goal_id,
        user_id=current_user.id,
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


def get_list(db: Session, current_user: UserDBM, milestone_id: int) -> list[TaskDataResponse]:
    milestone = db.scalar(
        select(MilestoneDBM).where(
            MilestoneDBM.id == milestone_id,
            MilestoneDBM.user_id == current_user.id,
        )
    )

    if milestone is None:
        raise NotFoundError(
            "Milestone not found. Please check the milestone and try again."
        )

    tasks = db.scalars(
        select(TaskDBM)
        .where(
            TaskDBM.milestone_id == milestone.id,
            TaskDBM.user_id == current_user.id,
        )
        .order_by(TaskDBM.position.asc(), TaskDBM.id.asc())
    ).all()

    return [_serialize_task(task) for task in tasks]


def get_task_detail(db: Session, current_user: UserDBM, task_id: int) -> TaskDataResponse:
    task = db.scalar(
        select(TaskDBM).where(
            TaskDBM.id == task_id,
            TaskDBM.user_id == current_user.id,
        )
    )

    if task is None:
        raise NotFoundError("Task not found. Please check and try again.")

    return _serialize_task(task)


def update_task(
    db: Session,
    current_user: UserDBM,
    task_id: int,
    data: TaskUpdateRequest,
) -> TaskDataResponse:
    task = db.scalar(
        select(TaskDBM).where(
            TaskDBM.id == task_id,
            TaskDBM.user_id == current_user.id,
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
        now = datetime.now(UTC)
        if data.status == "In Progress" and task.started_at is None:
            task.started_at = now
        elif data.status == "Paused":
            task.paused_at = now
        elif data.status == "Completed":
            task.completed_at = now
        elif data.status == "Cancelled":
            task.cancelled_at = now

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


def delete_task(db: Session, current_user: UserDBM, task_id: int) -> None:
    task = db.scalar(
        select(TaskDBM).where(
            TaskDBM.id == task_id,
            TaskDBM.user_id == current_user.id,
        )
    )

    if task is None:
        raise NotFoundError("Task not found. Please check and try again.")

    milestone = db.scalar(select(MilestoneDBM).where(MilestoneDBM.id == task.milestone_id))

    db.delete(task)

    if milestone is not None:
        milestone.total_tasks = max(0, (milestone.total_tasks or 1) - 1)
        if task.status == "Completed":
            milestone.completed_tasks = max(0, (milestone.completed_tasks or 1) - 1)

    db.commit()
