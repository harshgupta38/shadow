from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.goal import GoalDBM
from app.models.habit import HabitDBM
from app.models.user import UserDBM
from app.schemas.habits import GoalSummary, HabitCreateRequest, HabitDataResponse, HabitUpdateRequest
from app.services import planner_service


def _serialize(habit: HabitDBM) -> HabitDataResponse:
    is_metric = habit.planner_type == "metric"
    goal_summary: GoalSummary | None = None
    if habit.goal_id is not None and habit.goal is not None:
        goal_summary = GoalSummary(
            id=habit.goal.id,
            title=habit.goal.title,
            category=habit.goal.category,
        )
    return HabitDataResponse(
        id=habit.id,
        title=habit.title,
        note=habit.note,
        planner_type=habit.planner_type,
        planner_target=habit.planner_target if is_metric else None,
        value_unit=habit.value_unit if is_metric else None,
        goal=goal_summary,
        frequencies=habit.frequencies,
        priority=habit.priority,
        weekly_count=habit.weekly_count,
        monthly_count=habit.monthly_count,
        specific_days=habit.specific_days,
        day_fallback=habit.day_fallback,
        start_date=habit.start_date,
        end_date=habit.end_date,
        preferred_time=habit.preferred_time,
        specific_time=habit.specific_time or "",
        duration_minutes=habit.duration_minutes,
        status=habit.status,
        created_at=habit.created_at,
        updated_at=habit.updated_at,
    )


def _resolve_goal(db: Session, current_user: UserDBM, goal_id: int | None) -> int | None:
    if goal_id is None:
        return None
    goal = db.scalar(
        select(GoalDBM).where(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id)
    )
    if goal is None:
        raise NotFoundError("Goal not found.")
    return goal_id


def get_list(
    db: Session,
    current_user: UserDBM,
    *,
    status: str | None = None,
) -> list[HabitDataResponse]:
    stmt = select(HabitDBM).options(joinedload(HabitDBM.goal)).where(HabitDBM.user_id == current_user.id)
    if status is not None:
        stmt = stmt.where(HabitDBM.status == status)
    habits = db.scalars(stmt.order_by(HabitDBM.updated_at.desc(), HabitDBM.id.desc())).all()
    return [_serialize(h) for h in habits]


def save_habit(
    db: Session,
    current_user: UserDBM,
    data: HabitCreateRequest,
) -> HabitDataResponse:
    goal_id = _resolve_goal(db, current_user, data.goal_id)

    specific_days = data.specific_days or None
    day_fallback  = data.day_fallback and bool(specific_days) and any(d >= 29 for d in specific_days)

    is_metric = data.planner_type == "metric"
    habit = HabitDBM(
        user_id=current_user.id,
        goal_id=goal_id,
        title=data.title.strip(),
        note=data.note.strip() if data.note and data.note.strip() else None,
        frequencies=list(data.frequencies),
        preferred_time=data.preferred_time,
        specific_time=data.specific_time.strip() if data.preferred_time == "custom" and data.specific_time else None,
        duration_minutes=data.duration_minutes,
        start_date=data.start_date,
        end_date=data.end_date,
        priority=data.priority,
        status="active",
        weekly_count=data.weekly_count if "weekly" in data.frequencies else None,
        monthly_count=data.monthly_count if "monthly" in data.frequencies else None,
        specific_days=specific_days,
        day_fallback=day_fallback,
        planner_type=data.planner_type,
        planner_target=data.planner_target if is_metric else None,
        value_unit=data.value_unit.strip() if is_metric and data.value_unit and data.value_unit.strip() else None,
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)
    planner_service.sync_plan_from_habit(db, habit)
    return _serialize(habit)


def update_habit(
    db: Session,
    current_user: UserDBM,
    habit_id: int,
    data: HabitUpdateRequest,
) -> HabitDataResponse:
    habit = db.scalar(
        select(HabitDBM).where(
            HabitDBM.id == habit_id,
            HabitDBM.user_id == current_user.id,
        )
    )
    if habit is None:
        raise NotFoundError("Habit not found.")

    fields = data.model_fields_set

    if "title" in fields and data.title is not None:
        habit.title = data.title.strip()
    if "note" in fields:
        habit.note = data.note.strip() if data.note and data.note.strip() else None
    if "goal_id" in fields:
        habit.goal_id = _resolve_goal(db, current_user, data.goal_id)

    if "frequencies" in fields and data.frequencies is not None:
        habit.frequencies = list(data.frequencies)
        if "weekly" not in habit.frequencies:
            habit.weekly_count = None
        if "monthly" not in habit.frequencies:
            habit.monthly_count = None
        if "specific_day" not in habit.frequencies:
            habit.specific_days = None
            habit.day_fallback = False

    if "preferred_time" in fields and data.preferred_time is not None:
        habit.preferred_time = data.preferred_time
        if data.preferred_time != "custom":
            habit.specific_time = None
    if "specific_time" in fields and habit.preferred_time == "custom":
        habit.specific_time = data.specific_time.strip() if data.specific_time else None
    if "duration_minutes" in fields:
        habit.duration_minutes = data.duration_minutes
    if "start_date" in fields:
        habit.start_date = data.start_date
    if "end_date" in fields:
        habit.end_date = data.end_date
    if "priority" in fields and data.priority is not None:
        habit.priority = data.priority
    if "status" in fields and data.status is not None:
        habit.status = data.status

    effective_freqs = habit.frequencies

    if "weekly_count" in fields:
        habit.weekly_count = data.weekly_count if "weekly" in effective_freqs else None
    if "monthly_count" in fields:
        habit.monthly_count = data.monthly_count if "monthly" in effective_freqs else None
    if "specific_days" in fields:
        new_days = data.specific_days or None
        if new_days and "specific_day" not in habit.frequencies:
            raise ValidationError(
                errors={"specific_days": "'specific_days' is only valid when 'specific_day' is in frequencies."}
            )
        habit.specific_days = new_days
        if not new_days or not any(d >= 29 for d in new_days):
            habit.day_fallback = False
    if "day_fallback" in fields and data.day_fallback is not None:
        current_days = habit.specific_days or []
        habit.day_fallback = data.day_fallback and any(d >= 29 for d in current_days)

    if "planner_type" in fields and data.planner_type is not None:
        habit.planner_type = data.planner_type
        if data.planner_type == "simple":
            habit.planner_target = None
            habit.value_unit = None
    if "planner_target" in fields:
        habit.planner_target = data.planner_target if habit.planner_type == "metric" else None
    if "value_unit" in fields:
        if habit.planner_type == "metric":
            habit.value_unit = data.value_unit.strip() if data.value_unit and data.value_unit.strip() else None
        else:
            habit.value_unit = None

    db.commit()
    db.refresh(habit)
    planner_service.sync_plan_from_habit(db, habit)
    return _serialize(habit)


def delete_habit(db: Session, current_user: UserDBM, habit_id: int) -> None:
    habit = db.scalar(
        select(HabitDBM).where(
            HabitDBM.id == habit_id,
            HabitDBM.user_id == current_user.id,
        )
    )
    if habit is None:
        raise NotFoundError("Habit not found.")
    planner_service.deactivate_plan(db, "habit", habit_id)
    db.delete(habit)
    db.commit()
