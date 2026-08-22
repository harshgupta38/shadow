from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
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
