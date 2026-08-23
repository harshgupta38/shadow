from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.models.habit import HabitDBM
from app.models.user import UserDBM
from app.schemas.habits import HabitCreateRequest, HabitDataResponse, HabitUpdateRequest


def _serialize(habit: HabitDBM) -> HabitDataResponse:
    return HabitDataResponse.model_validate(habit)


def get_list(
    db: Session,
    current_user: UserDBM,
    *,
    status: str | None = None,
) -> list[HabitDataResponse]:
    stmt = select(HabitDBM).where(HabitDBM.user_id == current_user.id)
    if status is not None:
        stmt = stmt.where(HabitDBM.status == status)
    habits = db.scalars(stmt.order_by(HabitDBM.updated_at.desc(), HabitDBM.id.desc())).all()
    return [_serialize(h) for h in habits]


def save_habit(
    db: Session,
    current_user: UserDBM,
    data: HabitCreateRequest,
) -> HabitDataResponse:
    specific_days = data.specific_days or None
    day_fallback  = data.day_fallback and bool(specific_days) and any(d >= 29 for d in specific_days)

    is_metric = data.habit_type == "metric"
    habit = HabitDBM(
        user_id=current_user.id,
        name=data.name.strip(),
        motivation=data.motivation.strip() if data.motivation and data.motivation.strip() else None,
        frequencies=list(data.frequencies),
        preferred_time=data.preferred_time,
        specific_time=data.specific_time.strip() if data.preferred_time == "custom" else None,
        duration_minutes=data.duration_minutes,
        start_date=data.start_date,
        end_date=data.end_date,
        priority=data.priority,
        status="active",
        weekly_count=data.weekly_count if "weekly" in data.frequencies else None,
        monthly_count=data.monthly_count if "monthly" in data.frequencies else None,
        specific_days=specific_days,
        day_fallback=day_fallback,
        habit_type=data.habit_type,
        target_value=data.target_value if is_metric else None,
        target_unit=data.target_unit.strip() if data.target_unit and data.target_unit.strip() else "count",
        time_span=data.time_span,
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)
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

    if "name" in fields and data.name is not None:
        habit.name = data.name.strip()
    if "motivation" in fields:
        habit.motivation = (
            data.motivation.strip()
            if data.motivation and data.motivation.strip()
            else None
        )
    if "frequencies" in fields and data.frequencies is not None:
        habit.frequencies = list(data.frequencies)
        # Clear derived fields when their corresponding frequency type is removed.
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
    # Use the post-update frequencies list for all derived nullifications.
    effective_freqs = habit.frequencies  # already updated above if "frequencies" was in fields

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
        # Only store True when there are days ≥ 29 to apply it to
        current_days = habit.specific_days or []
        habit.day_fallback = data.day_fallback and any(d >= 29 for d in current_days)

    if "habit_type" in fields and data.habit_type is not None:
        habit.habit_type = data.habit_type
        if data.habit_type == "simple":
            habit.target_value = None
            habit.time_span = "Day"
    if "target_value" in fields:
        habit.target_value = data.target_value if habit.habit_type == "metric" else None
    if "target_unit" in fields and data.target_unit is not None:
        habit.target_unit = data.target_unit.strip() or "count"
    if "time_span" in fields and data.time_span is not None:
        habit.time_span = data.time_span

    db.commit()
    db.refresh(habit)
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
    db.delete(habit)
    db.commit()
