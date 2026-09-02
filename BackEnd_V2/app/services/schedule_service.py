import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.goal import GoalDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.scheduled_task_proposal import ScheduledTaskProposalDBM
from app.models.user import UserDBM
from app.models.yearly_task import YearlyTaskDBM
from app.schemas.schedule import (
    GoalSummary,
    SaveScheduledTaskFromProposalRequest,
    ScheduledTaskCreateRequest,
    ScheduledTaskDataResponse,
    ScheduledTaskUpdateRequest,
)
from app.services.planner_service import deactivate_plan, sync_plan_from_scheduled_task


def _resolve_goal(db: Session, current_user: UserDBM, goal_id: int | None) -> GoalDBM | None:
    if goal_id is None:
        return None
    goal = db.scalar(select(GoalDBM).where(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id))
    if goal is None:
        raise NotFoundError("Goal not found.")
    return goal


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
        repeat_yearly=False,
        category=task.category,
        goal=goal_summary,
        status=task.status,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _next_yearly_occurrence(month: int, day: int, today: date) -> date:
    try:
        candidate = date(today.year, month, day)
    except ValueError:
        last = calendar.monthrange(today.year, month)[1]
        candidate = date(today.year, month, min(day, last))
    if candidate >= today:
        return candidate
    next_year = today.year + 1
    try:
        return date(next_year, month, day)
    except ValueError:
        last = calendar.monthrange(next_year, month)[1]
        return date(next_year, month, min(day, last))


def _date_for_year_month(month: int, day: int, year: int) -> date:
    try:
        return date(year, month, day)
    except ValueError:
        last = calendar.monthrange(year, month)[1]
        return date(year, month, min(day, last))


def _serialize_yearly(task: YearlyTaskDBM, scheduled_date: date) -> ScheduledTaskDataResponse:
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
        scheduled_date=scheduled_date,
        preferred_time=task.preferred_time,
        specific_time=task.specific_time,
        allow_snoozing=task.allow_snoozing,
        snooze_limit=task.snooze_limit if task.allow_snoozing else None,
        duration_minutes=task.duration_minutes,
        repeat_yearly=True,
        category=task.category,
        goal=goal_summary,
        status="upcoming",
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def get_list(db: Session, current_user: UserDBM, year: int, month: int) -> list[ScheduledTaskDataResponse]:
    first_day = date(year, month, 1)
    last_day = date(year, month, calendar.monthrange(year, month)[1])

    tasks = db.scalars(
        select(ScheduledTaskDBM)
        .options(joinedload(ScheduledTaskDBM.goal))
        .where(
            ScheduledTaskDBM.user_id == current_user.id,
            ScheduledTaskDBM.scheduled_date >= first_day,
            ScheduledTaskDBM.scheduled_date <= last_day,
        )
    ).all()

    yearly_tasks = db.scalars(
        select(YearlyTaskDBM)
        .options(joinedload(YearlyTaskDBM.goal))
        .where(
            YearlyTaskDBM.user_id == current_user.id,
            YearlyTaskDBM.recurrence_month == month,
        )
    ).all()

    result: list[ScheduledTaskDataResponse] = [_serialize(t) for t in tasks]
    result += [
        _serialize_yearly(t, occ)
        for t in yearly_tasks
        if (occ := _date_for_year_month(t.recurrence_month, t.recurrence_day, year)) >= t.created_at.date()
    ]
    result.sort(key=lambda r: (r.scheduled_date, r.id))
    return result


def get_task(db: Session, current_user: UserDBM, task_id: int, is_yearly: bool) -> ScheduledTaskDataResponse:
    if is_yearly:
        task = db.scalar(
            select(YearlyTaskDBM)
            .options(joinedload(YearlyTaskDBM.goal))
            .where(YearlyTaskDBM.id == task_id, YearlyTaskDBM.user_id == current_user.id)
        )
        if task is None:
            raise NotFoundError("Yearly task not found.")
        return _serialize_yearly(task, _next_yearly_occurrence(task.recurrence_month, task.recurrence_day, date.today()))

    task = db.scalar(
        select(ScheduledTaskDBM)
        .options(joinedload(ScheduledTaskDBM.goal))
        .where(ScheduledTaskDBM.id == task_id, ScheduledTaskDBM.user_id == current_user.id)
    )
    if task is None:
        raise NotFoundError("Scheduled task not found.")
    return _serialize(task)


def save_task(
    db: Session,
    current_user: UserDBM,
    data: ScheduledTaskCreateRequest,
) -> ScheduledTaskDataResponse:
    goal = _resolve_goal(db, current_user, data.goal_id)
    is_metric = data.planner_type == "metric"

    if data.repeat_yearly:
        yearly_task = YearlyTaskDBM(
            user_id=current_user.id,
            goal_id=goal.id if goal is not None else None,
            title=data.title.strip(),
            note=data.note.strip() if data.note and data.note.strip() else None,
            category=goal.category if goal is not None else (data.category.strip() if data.category and data.category.strip() else None),
            planner_type=data.planner_type,
            planner_target=data.planner_target if is_metric else None,
            value_unit=data.value_unit.strip() if is_metric and data.value_unit and data.value_unit.strip() else None,
            priority=data.priority,
            recurrence_month=data.scheduled_date.month,
            recurrence_day=data.scheduled_date.day,
            preferred_time=data.preferred_time,
            specific_time=data.specific_time.strip() if data.preferred_time == "custom" and data.specific_time else None,
            allow_snoozing=data.allow_snoozing,
            snooze_limit=data.snooze_limit if data.allow_snoozing else None,
            duration_minutes=data.duration_minutes,
        )
        db.add(yearly_task)
        db.commit()
        db.refresh(yearly_task)
        return _serialize_yearly(yearly_task, _next_yearly_occurrence(yearly_task.recurrence_month, yearly_task.recurrence_day, date.today()))

    task = ScheduledTaskDBM(
        user_id=current_user.id,
        goal_id=goal.id if goal is not None else None,
        title=data.title.strip(),
        note=data.note.strip() if data.note and data.note.strip() else None,
        category=goal.category if goal is not None else (data.category.strip() if data.category and data.category.strip() else None),
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


def _validate_yearly_state(yearly: YearlyTaskDBM) -> None:
    if yearly.preferred_time != "custom":
        yearly.specific_time = None
    elif not yearly.specific_time or not yearly.specific_time.strip():
        raise ValidationError(errors={"specific_time": "A specific time is required when 'Custom time' is selected."})
    if yearly.planner_type == "metric" and yearly.planner_target is None:
        raise ValidationError(errors={"planner_target": "planner_target is required for metric tasks."})
    if not yearly.allow_snoozing:
        yearly.snooze_limit = None


def _validate_task_state(task: ScheduledTaskDBM) -> None:
    if task.preferred_time != "custom":
        task.specific_time = None
    elif not task.specific_time or not task.specific_time.strip():
        raise ValidationError(errors={"specific_time": "A specific time is required when 'Custom time' is selected."})
    if task.planner_type == "metric" and task.planner_target is None:
        raise ValidationError(errors={"planner_target": "planner_target is required for metric tasks."})
    if not task.allow_snoozing:
        task.snooze_limit = None


def update_task(
    db: Session,
    current_user: UserDBM,
    task_id: int,
    data: ScheduledTaskUpdateRequest,
    is_yearly: bool = False,
) -> ScheduledTaskDataResponse:
    fields = data.model_fields_set
    wants_yearly = data.repeat_yearly if "repeat_yearly" in fields else None

    # ── Switch: non-yearly → yearly ──────────────────────────────────────────
    if not is_yearly and wants_yearly is True:
        task = db.scalar(
            select(ScheduledTaskDBM).where(
                ScheduledTaskDBM.id == task_id,
                ScheduledTaskDBM.user_id == current_user.id,
            )
        )
        if task is None:
            raise NotFoundError("Scheduled task not found.")

        goal_id = data.goal_id if "goal_id" in fields else task.goal_id
        goal = _resolve_goal(db, current_user, goal_id)
        ref_date = data.scheduled_date if "scheduled_date" in fields and data.scheduled_date else task.scheduled_date
        planner_type = data.planner_type or task.planner_type
        is_metric = planner_type == "metric"

        yearly = YearlyTaskDBM(
            user_id=current_user.id,
            goal_id=goal.id if goal else task.goal_id,
            title=(data.title or task.title).strip(),
            note=(data.note.strip() if data.note and data.note.strip() else None) if "note" in fields else task.note,
            category=goal.category if goal else (data.category if "category" in fields else task.category),
            planner_type=planner_type,
            planner_target=(data.planner_target if "planner_target" in fields else task.planner_target) if is_metric else None,
            value_unit=(data.value_unit.strip() if data.value_unit and data.value_unit.strip() else None) if is_metric else None,
            priority=data.priority or task.priority,
            recurrence_month=ref_date.month,
            recurrence_day=ref_date.day,
            preferred_time=data.preferred_time or task.preferred_time,
            specific_time=data.specific_time if "specific_time" in fields else task.specific_time,
            allow_snoozing=data.allow_snoozing if data.allow_snoozing is not None else task.allow_snoozing,
            snooze_limit=data.snooze_limit if "snooze_limit" in fields else task.snooze_limit,
            duration_minutes=data.duration_minutes if "duration_minutes" in fields else task.duration_minutes,
        )
        _validate_yearly_state(yearly)
        db.add(yearly)
        deactivate_plan(db, "schedule", task.id)
        db.refresh(task)
        db.delete(task)
        db.commit()
        db.refresh(yearly)
        return _serialize_yearly(yearly, _next_yearly_occurrence(yearly.recurrence_month, yearly.recurrence_day, date.today()))

    # ── Switch: yearly → non-yearly ──────────────────────────────────────────
    if is_yearly and wants_yearly is False:
        yearly = db.scalar(
            select(YearlyTaskDBM).where(
                YearlyTaskDBM.id == task_id,
                YearlyTaskDBM.user_id == current_user.id,
            )
        )
        if yearly is None:
            raise NotFoundError("Yearly task not found.")

        goal_id = data.goal_id if "goal_id" in fields else yearly.goal_id
        goal = _resolve_goal(db, current_user, goal_id)
        scheduled_date = data.scheduled_date if "scheduled_date" in fields and data.scheduled_date else \
            _next_yearly_occurrence(yearly.recurrence_month, yearly.recurrence_day, date.today())
        planner_type = data.planner_type or yearly.planner_type
        is_metric = planner_type == "metric"

        task = ScheduledTaskDBM(
            user_id=current_user.id,
            goal_id=goal.id if goal else yearly.goal_id,
            title=(data.title or yearly.title).strip(),
            note=(data.note.strip() if data.note and data.note.strip() else None) if "note" in fields else yearly.note,
            category=goal.category if goal else (data.category if "category" in fields else yearly.category),
            planner_type=planner_type,
            planner_target=(data.planner_target if "planner_target" in fields else yearly.planner_target) if is_metric else None,
            value_unit=(data.value_unit.strip() if data.value_unit and data.value_unit.strip() else None) if is_metric else None,
            priority=data.priority or yearly.priority,
            scheduled_date=scheduled_date,
            preferred_time=data.preferred_time or yearly.preferred_time,
            specific_time=data.specific_time if "specific_time" in fields else yearly.specific_time,
            allow_snoozing=data.allow_snoozing if data.allow_snoozing is not None else yearly.allow_snoozing,
            snooze_limit=data.snooze_limit if "snooze_limit" in fields else yearly.snooze_limit,
            duration_minutes=data.duration_minutes if "duration_minutes" in fields else yearly.duration_minutes,
            status="upcoming",
        )
        _validate_task_state(task)
        db.add(task)
        db.delete(yearly)
        db.commit()
        db.refresh(task)
        sync_plan_from_scheduled_task(db, task)
        return _serialize(task)

    # ── In-place update: yearly task ─────────────────────────────────────────
    if is_yearly:
        yearly = db.scalar(
            select(YearlyTaskDBM).where(
                YearlyTaskDBM.id == task_id,
                YearlyTaskDBM.user_id == current_user.id,
            )
        )
        if yearly is None:
            raise NotFoundError("Yearly task not found.")

        if "title" in fields and data.title is not None:
            yearly.title = data.title.strip()
        if "note" in fields:
            yearly.note = data.note.strip() if data.note and data.note.strip() else None
        if "priority" in fields and data.priority is not None:
            yearly.priority = data.priority
        if "scheduled_date" in fields and data.scheduled_date is not None:
            yearly.recurrence_month = data.scheduled_date.month
            yearly.recurrence_day = data.scheduled_date.day
        if "preferred_time" in fields and data.preferred_time is not None:
            yearly.preferred_time = data.preferred_time
            if data.preferred_time != "custom":
                yearly.specific_time = None
        if "specific_time" in fields and yearly.preferred_time == "custom":
            yearly.specific_time = data.specific_time.strip() if data.specific_time else None
        if "allow_snoozing" in fields and data.allow_snoozing is not None:
            yearly.allow_snoozing = data.allow_snoozing
            if not data.allow_snoozing:
                yearly.snooze_limit = None
        if "snooze_limit" in fields and yearly.allow_snoozing:
            yearly.snooze_limit = data.snooze_limit
        if "duration_minutes" in fields:
            yearly.duration_minutes = data.duration_minutes
        if "goal_id" in fields:
            goal = _resolve_goal(db, current_user, data.goal_id)
            yearly.goal_id = goal.id if goal is not None else None
        if "goal_id" in fields or "category" in fields:
            if yearly.goal_id is not None:
                linked_goal = db.get(GoalDBM, yearly.goal_id)
                yearly.category = linked_goal.category if linked_goal is not None else None
            elif "category" in fields:
                yearly.category = data.category.strip() if data.category and data.category.strip() else None
            else:
                yearly.category = None
        if "planner_type" in fields and data.planner_type is not None:
            yearly.planner_type = data.planner_type
            if data.planner_type == "simple":
                yearly.planner_target = None
                yearly.value_unit = None
        if "planner_target" in fields:
            yearly.planner_target = data.planner_target if yearly.planner_type == "metric" else None
        if "value_unit" in fields:
            yearly.value_unit = (data.value_unit.strip() if data.value_unit and data.value_unit.strip() else None) \
                if yearly.planner_type == "metric" else None

        _validate_yearly_state(yearly)
        db.commit()
        db.refresh(yearly)
        return _serialize_yearly(yearly, _next_yearly_occurrence(yearly.recurrence_month, yearly.recurrence_day, date.today()))

    # ── In-place update: non-yearly task ─────────────────────────────────────
    task = db.scalar(
        select(ScheduledTaskDBM).where(
            ScheduledTaskDBM.id == task_id,
            ScheduledTaskDBM.user_id == current_user.id,
        )
    )
    if task is None:
        raise NotFoundError("Scheduled task not found.")

    if "title" in fields and data.title is not None:
        task.title = data.title.strip()
    if "note" in fields:
        task.note = data.note.strip() if data.note and data.note.strip() else None
    if "priority" in fields and data.priority is not None:
        task.priority = data.priority
    if "scheduled_date" in fields and data.scheduled_date is not None:
        task.scheduled_date = data.scheduled_date
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

    if "goal_id" in fields:
        goal = _resolve_goal(db, current_user, data.goal_id)
        task.goal_id = goal.id if goal is not None else None

    if "goal_id" in fields or "category" in fields:
        if task.goal_id is not None:
            linked_goal = db.get(GoalDBM, task.goal_id)
            task.category = linked_goal.category if linked_goal is not None else None
        elif "category" in fields:
            task.category = data.category.strip() if data.category and data.category.strip() else None
        else:
            task.category = None

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

    _validate_task_state(task)
    db.commit()
    db.refresh(task)
    sync_plan_from_scheduled_task(db, task)
    return _serialize(task)


def save_task_from_proposal(
    db: Session,
    current_user: UserDBM,
    data: SaveScheduledTaskFromProposalRequest,
) -> ScheduledTaskDataResponse:
    proposal = db.scalar(
        select(ScheduledTaskProposalDBM)
        .where(ScheduledTaskProposalDBM.proposal_id == data.proposal_id)
    )

    if proposal is None or proposal.user_id != current_user.id:
        raise NotFoundError("Scheduled task proposal not found.")

    if proposal.scheduled_task_id is not None:
        existing = db.scalar(
            select(ScheduledTaskDBM).where(
                ScheduledTaskDBM.id == proposal.scheduled_task_id,
                ScheduledTaskDBM.user_id == current_user.id,
            )
        )
        if existing is not None:
            return _serialize(existing)

    task_data = data.task.model_copy(update={"repeat_yearly": False})
    result = save_task(db, current_user, task_data)

    proposal.status = "saved"
    proposal.scheduled_task_id = result.id
    db.commit()

    return result


def delete_task(db: Session, current_user: UserDBM, task_id: int, is_yearly: bool = False) -> None:
    if is_yearly:
        yearly = db.scalar(
            select(YearlyTaskDBM).where(
                YearlyTaskDBM.id == task_id,
                YearlyTaskDBM.user_id == current_user.id,
            )
        )
        if yearly is None:
            raise NotFoundError("Yearly task not found.")
        db.delete(yearly)
        db.commit()
        return

    task = db.scalar(
        select(ScheduledTaskDBM).where(
            ScheduledTaskDBM.id == task_id,
            ScheduledTaskDBM.user_id == current_user.id,
        )
    )
    if task is None:
        raise NotFoundError("Scheduled task not found.")
    deactivate_plan(db, "schedule", task.id)
    db.refresh(task)
    db.delete(task)
    db.commit()
