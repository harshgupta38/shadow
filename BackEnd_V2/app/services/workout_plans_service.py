"""Training plans: the ready-made library, the user's own plans, and which plan the user follows."""

from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.common import today_ist
from app.common.workout import SECONDARY_CREDIT, estimate_minutes
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.models.user import UserDBM
from app.models.workout import (
    WorkoutExerciseDBM,
    WorkoutPlanDayDBM,
    WorkoutPlanDBM,
    WorkoutPlanExerciseDBM,
    WorkoutSettingDBM,
)
from app.schemas.workout import (
    PlanDayInput,
    PlanDayResponse,
    PlanExerciseResponse,
    PlanSource,
    WorkoutPlanDetailResponse,
    WorkoutPlanSaveRequest,
    WorkoutPlanSummaryResponse,
)
from app.services.workout_library_service import exercise_summary

_PLAN_NAME_MAX = 80
_COPY_SUFFIX = " (copy)"
_TOP_MUSCLE_COUNT = 6


def _plan_query():
    return (
        select(WorkoutPlanDBM)
        .options(selectinload(WorkoutPlanDBM.days).selectinload(WorkoutPlanDayDBM.exercises))
        .execution_options(populate_existing=True)
    )


def _visible(db: Session, user: UserDBM, plan_id: int) -> WorkoutPlanDBM:
    """A ready-made plan or one of the user's own. Anyone else's plan is reported as not found."""
    plan = db.scalar(
        _plan_query().where(
            WorkoutPlanDBM.id == plan_id,
            or_(WorkoutPlanDBM.user_id.is_(None), WorkoutPlanDBM.user_id == user.id),
        )
    )
    if plan is None:
        raise NotFoundError("Plan not found.")
    return plan


def _owned(db: Session, user: UserDBM, plan_id: int) -> WorkoutPlanDBM:
    plan = _visible(db, user, plan_id)
    if plan.user_id != user.id:
        raise ForbiddenError("Ready-made plans can't be changed. Customize a copy instead.")
    return plan


def active_plan_id(db: Session, user_id: int) -> int | None:
    setting = db.get(WorkoutSettingDBM, user_id)
    return setting.active_plan_id if setting else None


def active_plan_started_on(db: Session, user_id: int) -> date | None:
    setting = db.get(WorkoutSettingDBM, user_id)
    return setting.active_plan_started_on if setting else None


def active_plan(db: Session, user: UserDBM) -> WorkoutPlanDBM | None:
    plan_id = active_plan_id(db, user.id)
    if plan_id is None:
        return None
    return db.scalar(_plan_query().where(WorkoutPlanDBM.id == plan_id))


def day_minutes(day: WorkoutPlanDayDBM) -> int:
    return estimate_minutes((entry.sets, entry.rest_seconds, entry.reps) for entry in day.exercises)


def day_response(day: WorkoutPlanDayDBM) -> PlanDayResponse:
    return PlanDayResponse(
        id=day.id,
        weekday=day.weekday,
        name=day.name,
        estimated_minutes=day_minutes(day),
        exercises=[
            PlanExerciseResponse(
                id=entry.id,
                exercise=exercise_summary(entry.exercise),
                sets=entry.sets,
                reps=entry.reps,
                rest_seconds=entry.rest_seconds,
                weight_kg=entry.weight_kg,
                note=entry.note,
            )
            for entry in day.exercises
        ],
    )


def plan_summary(plan: WorkoutPlanDBM, active_id: int | None) -> WorkoutPlanSummaryResponse:
    weights: dict[str, float] = {}
    equipment: list[str] = []
    minutes: list[int] = []
    for day in plan.days:
        minutes.append(day_minutes(day))
        for entry in day.exercises:
            exercise = entry.exercise
            if exercise.kind == "strength":  # cardio and warm-ups are not counted as muscle work
                for muscle in exercise.primary_muscles:
                    weights[muscle] = weights.get(muscle, 0) + entry.sets
                for muscle in exercise.secondary_muscles:
                    weights[muscle] = weights.get(muscle, 0) + entry.sets * SECONDARY_CREDIT
            if exercise.equipment not in equipment:
                equipment.append(exercise.equipment)

    top_muscles = sorted(weights, key=lambda muscle: weights[muscle], reverse=True)[:_TOP_MUSCLE_COUNT]
    return WorkoutPlanSummaryResponse(
        id=plan.id,
        name=plan.name,
        description=plan.description,
        goal=plan.goal,
        level=plan.level,
        source="predefined" if plan.user_id is None else "custom",
        is_active=plan.id == active_id,
        days_per_week=len(plan.days),
        weekdays=[day.weekday for day in plan.days],
        avg_minutes=int(sum(minutes) / len(minutes) + 0.5) if minutes else 0,
        muscles=top_muscles,
        equipment=equipment,
        cover_image_url=None,
    )


def plan_detail(plan: WorkoutPlanDBM, active_id: int | None) -> WorkoutPlanDetailResponse:
    return WorkoutPlanDetailResponse(
        **plan_summary(plan, active_id).model_dump(),
        days=[day_response(day) for day in plan.days],
    )


def _build_days(db: Session, days: list[PlanDayInput]) -> list[WorkoutPlanDayDBM]:
    wanted = {entry.exercise_id for day in days for entry in day.exercises}
    known = set(db.scalars(select(WorkoutExerciseDBM.id).where(WorkoutExerciseDBM.id.in_(wanted))).all())
    if wanted - known:
        message = "Some exercises are no longer in the library. Remove them and try again."
        raise ValidationError(message, errors={"days": message})

    return [
        WorkoutPlanDayDBM(
            weekday=day.weekday,
            name=day.name,
            exercises=[
                WorkoutPlanExerciseDBM(
                    position=position,
                    exercise_id=entry.exercise_id,
                    sets=entry.sets,
                    reps=entry.reps,
                    rest_seconds=entry.rest_seconds,
                    weight_kg=entry.weight_kg,
                    note=entry.note,
                )
                for position, entry in enumerate(day.exercises)
            ],
        )
        for day in days
    ]


def list_plans(db: Session, user: UserDBM, source: PlanSource | None) -> list[WorkoutPlanSummaryResponse]:
    query = _plan_query().where(or_(WorkoutPlanDBM.user_id.is_(None), WorkoutPlanDBM.user_id == user.id))
    if source == "predefined":
        query = query.where(WorkoutPlanDBM.user_id.is_(None))
    elif source == "custom":
        query = query.where(WorkoutPlanDBM.user_id == user.id)
    query = query.order_by(WorkoutPlanDBM.user_id.is_(None).desc(), WorkoutPlanDBM.sort_order, WorkoutPlanDBM.id)

    active_id = active_plan_id(db, user.id)
    return [plan_summary(plan, active_id) for plan in db.scalars(query).all()]


def get_plan(db: Session, user: UserDBM, plan_id: int) -> WorkoutPlanDetailResponse:
    return plan_detail(_visible(db, user, plan_id), active_plan_id(db, user.id))


def create_plan(db: Session, user: UserDBM, data: WorkoutPlanSaveRequest) -> WorkoutPlanDetailResponse:
    plan = WorkoutPlanDBM(
        user_id=user.id,
        name=data.name,
        description=data.description,
        goal=data.goal,
        level=data.level,
        days=_build_days(db, data.days),
    )
    db.add(plan)
    db.commit()
    return get_plan(db, user, plan.id)


def update_plan(db: Session, user: UserDBM, plan_id: int, data: WorkoutPlanSaveRequest) -> WorkoutPlanDetailResponse:
    plan = _owned(db, user, plan_id)
    days = _build_days(db, data.days)  # validate before touching the plan, so a bad request changes nothing

    plan.name = data.name
    plan.description = data.description
    plan.goal = data.goal
    plan.level = data.level
    plan.days.clear()
    db.flush()  # the old days must go before the new ones reuse their weekdays
    plan.days.extend(days)
    db.commit()
    return get_plan(db, user, plan_id)


def delete_plan(db: Session, user: UserDBM, plan_id: int) -> None:
    # Sessions keep their plan_name, and the active-plan pointer is cleared by the foreign key.
    db.delete(_owned(db, user, plan_id))
    db.commit()


def _copy_name(name: str) -> str:
    return name[: _PLAN_NAME_MAX - len(_COPY_SUFFIX)] + _COPY_SUFFIX


def duplicate_plan(db: Session, user: UserDBM, plan_id: int) -> WorkoutPlanDetailResponse:
    source = _visible(db, user, plan_id)
    copy = WorkoutPlanDBM(
        user_id=user.id,
        name=_copy_name(source.name),
        description=source.description,
        goal=source.goal,
        level=source.level,
        days=[
            WorkoutPlanDayDBM(
                weekday=day.weekday,
                name=day.name,
                exercises=[
                    WorkoutPlanExerciseDBM(
                        position=entry.position,
                        exercise_id=entry.exercise_id,
                        sets=entry.sets,
                        reps=entry.reps,
                        rest_seconds=entry.rest_seconds,
                        weight_kg=entry.weight_kg,
                        note=entry.note,
                    )
                    for entry in day.exercises
                ],
            )
            for day in source.days
        ],
    )
    db.add(copy)
    db.commit()
    return get_plan(db, user, copy.id)


def _settings_for_update(db: Session, user_id: int) -> WorkoutSettingDBM:
    setting = db.get(WorkoutSettingDBM, user_id)
    if setting is None:
        setting = WorkoutSettingDBM(user_id=user_id)
        db.add(setting)
    return setting


def activate_plan(db: Session, user: UserDBM, plan_id: int) -> WorkoutPlanSummaryResponse:
    plan = _visible(db, user, plan_id)
    setting = _settings_for_update(db, user.id)
    # Following a plan starts it today. Selecting the plan already followed keeps its start day.
    if setting.active_plan_id != plan.id:
        setting.active_plan_id = plan.id
        setting.active_plan_started_on = today_ist()
    db.commit()
    return plan_summary(plan, plan.id)


def deactivate_plan(db: Session, user: UserDBM) -> None:
    setting = _settings_for_update(db, user.id)
    setting.active_plan_id = None
    setting.active_plan_started_on = None
    db.commit()
