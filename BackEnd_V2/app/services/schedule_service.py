from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.goal import GoalDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.user import UserDBM
from app.schemas.schedule import (
    GoalSummary,
    ScheduledTaskCreateRequest,
    ScheduledTaskDataResponse,
    ScheduledTaskUpdateRequest,
)
from app.services.planner_service import deactivate_plan, sync_plan_from_scheduled_task


def _resolve_goal(db: Session, current_user: UserDBM, goal_id: int | None) -> int | None:
    if goal_id is None:
        return None
    goal = db.scalar(select(GoalDBM).where(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id))
    if goal is None:
        raise NotFoundError("Goal not found.")
    return goal_id


def _serialize(task: ScheduledTaskDBM) -> ScheduledTaskDataResponse:
    is_metric = task.planner_type == "metric"
    goal_summary: GoalSummary | None = None
    if task.goal_id is not None and task.goal is not None:
        goal_summary = GoalSummary(id=task.goal.id, title=task.goal.title, category=task.goal.category)
    return ScheduledTaskDataResponse(
        id=task.id,
        title=task.title,
        note=task.note,
        planner_type=task.planner_type,
        planner_target=task.planner_target if is_metric else None,
        value_unit=task.value_unit if is_metric else None,
        priority=task.priority,
        scheduled_date=task.scheduled_date,
        preferred_time=task.preferred_time,
        specific_time=task.specific_time,
        allow_snoozing=task.allow_snoozing,
        snooze_limit=task.snooze_limit if task.allow_snoozing else None,
        duration_minutes=task.duration_minutes,
        category=task.category,
        goal=goal_summary,
        status=task.status,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def get_list(db: Session, current_user: UserDBM) -> list[ScheduledTaskDataResponse]:
    tasks = db.scalars(
        select(ScheduledTaskDBM)
        .options(joinedload(ScheduledTaskDBM.goal))
        .where(ScheduledTaskDBM.user_id == current_user.id)
        .order_by(ScheduledTaskDBM.scheduled_date.asc(), ScheduledTaskDBM.id.asc())
    ).all()
    return [_serialize(t) for t in tasks]


def save_task(
    db: Session,
    current_user: UserDBM,
    data: ScheduledTaskCreateRequest,
) -> ScheduledTaskDataResponse:
    goal_id = _resolve_goal(db, current_user, data.goal_id)
    is_metric = data.planner_type == "metric"
    task = ScheduledTaskDBM(
        user_id=current_user.id,
        goal_id=goal_id,
        title=data.title.strip(),
        note=data.note.strip() if data.note and data.note.strip() else None,
        category=data.category.strip() if data.category and data.category.strip() else None,
        planner_type=data.planner_type,
        planner_target=data.planner_target if is_metric else None,
        value_unit=data.value_unit.strip() if is_metric and data.value_unit and data.value_unit.strip() else None,
        priority=data.priority,
        scheduled_date=data.scheduled_date,
        preferred_time=data.preferred_time,
        specific_time=data.specific_time.strip() if data.preferred_time == "custom" and data.specific_time else None,
        allow_snoozing=data.allow_snoozing,
        snooze_limit=data.snooze_limit if data.allow_snoozing else None,
        duration_minutes=data.duration_minutes,
        status="upcoming",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    sync_plan_from_scheduled_task(db, task)
    return _serialize(task)


def update_task(
    db: Session,
    current_user: UserDBM,
    task_id: int,
    data: ScheduledTaskUpdateRequest,
) -> ScheduledTaskDataResponse:
    task = db.scalar(
        select(ScheduledTaskDBM).where(
            ScheduledTaskDBM.id == task_id,
            ScheduledTaskDBM.user_id == current_user.id,
        )
    )
    if task is None:
        raise NotFoundError("Scheduled task not found.")

    fields = data.model_fields_set

    if "title" in fields and data.title is not None:
        task.title = data.title.strip()
    if "note" in fields:
        task.note = data.note.strip() if data.note and data.note.strip() else None
    if "priority" in fields and data.priority is not None:
        task.priority = data.priority
    if "scheduled_date" in fields and data.scheduled_date is not None:
        task.scheduled_date = data.scheduled_date
        # Rescheduling reactivates a completed or missed task.
        if task.status in ("completed", "missed"):
            task.status = "upcoming"

    if "preferred_time" in fields and data.preferred_time is not None:
        task.preferred_time = data.preferred_time
        if data.preferred_time != "custom":
            task.specific_time = None
    if "specific_time" in fields and task.preferred_time == "custom":
        task.specific_time = data.specific_time.strip() if data.specific_time else None

    if "allow_snoozing" in fields and data.allow_snoozing is not None:
        task.allow_snoozing = data.allow_snoozing
        if not data.allow_snoozing:
            task.snooze_limit = None
    if "snooze_limit" in fields and task.allow_snoozing:
        task.snooze_limit = data.snooze_limit

    if "duration_minutes" in fields:
        task.duration_minutes = data.duration_minutes

    if "category" in fields:
        task.category = data.category.strip() if data.category and data.category.strip() else None
    if "goal_id" in fields:
        task.goal_id = _resolve_goal(db, current_user, data.goal_id)

    if "planner_type" in fields and data.planner_type is not None:
        task.planner_type = data.planner_type
        if data.planner_type == "simple":
            task.planner_target = None
            task.value_unit = None
    if "planner_target" in fields:
        task.planner_target = data.planner_target if task.planner_type == "metric" else None
    if "value_unit" in fields:
        if task.planner_type == "metric":
            task.value_unit = data.value_unit.strip() if data.value_unit and data.value_unit.strip() else None
        else:
            task.value_unit = None

    # ── Final merged-state validation ─────────────────────────────────────────
    # Validate the complete object after all fields have been applied, so rules
    # that span multiple fields (e.g. metric requires planner_target) are
    # checked against the actual final state, not just the incoming payload.

    if task.preferred_time != "custom":
        task.specific_time = None
    elif not task.specific_time or not task.specific_time.strip():
        raise ValidationError(
            errors={"specific_time": "A specific time is required when 'Custom time' is selected."}
        )

    if task.planner_type == "metric" and task.planner_target is None:
        raise ValidationError(
            errors={"planner_target": "planner_target is required for metric tasks."}
        )

    if not task.allow_snoozing:
        task.snooze_limit = None

    db.commit()
    db.refresh(task)
    sync_plan_from_scheduled_task(db, task)
    return _serialize(task)


def delete_task(db: Session, current_user: UserDBM, task_id: int) -> None:
    task = db.scalar(
        select(ScheduledTaskDBM).where(
            ScheduledTaskDBM.id == task_id,
            ScheduledTaskDBM.user_id == current_user.id,
        )
    )
    if task is None:
        raise NotFoundError("Scheduled task not found.")
    deactivate_plan(db, "schedule", task.id)  # archives plan + purges records, commits
    db.refresh(task)
    db.delete(task)
    db.commit()
