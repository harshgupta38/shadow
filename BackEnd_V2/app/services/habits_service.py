from datetime import date

from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.goal import GoalDBM
from app.models.habit import HabitDBM
from app.models.plan import PlanDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.user import UserDBM
from app.schemas.habits import (
    GoalSummary,
    HabitCreateRequest,
    HabitDataResponse,
    HabitHistoryRecord,
    HabitHistoryResponse,
    HabitHistoryStats,
    HabitStatus,
    HabitUpdateRequest,
    SetTrackingRequest,
)
from app.schemas.planner import DailyPlanItemResponse, DailyPlanSavedData, GoalDataInPlan
from app.services import planner_service


def _serialize(habit: HabitDBM, streaks: tuple[int, int] = (0, 0)) -> HabitDataResponse:
    is_metric = habit.planner_type == "metric"
    goal_summary: GoalSummary | None = None
    if habit.goal_id is not None and habit.goal is not None:
        goal_summary = GoalSummary(
            id=habit.goal.id,
            title=habit.goal.title,
            category=habit.goal.category,
        )
    current_streak, max_streak = streaks
    return HabitDataResponse(
        id=habit.id,
        title=habit.title,
        note=habit.note,
        planner_type=habit.planner_type,
        planner_target=habit.planner_target if is_metric else None,
        value_unit=habit.value_unit if is_metric else None,
        category=habit.category,
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
        current_streak=current_streak,
        max_streak=max_streak,
        created_at=habit.created_at,
        updated_at=habit.updated_at,
    )


def _compute_habit_streak(db: Session, habit: HabitDBM) -> tuple[int, int]:
    plan = db.scalar(
        select(PlanDBM).where(
            PlanDBM.source_type == "habit",
            PlanDBM.source_id == habit.id,
            PlanDBM.user_id == habit.user_id,
        )
    )
    if plan is None:
        return 0, 0
    return planner_service.compute_streaks_for_plan(db, plan, date.today())


def _resolve_goal(db: Session, current_user: UserDBM, goal_id: int | None) -> GoalDBM | None:
    if goal_id is None:
        return None
    goal = db.scalar(
        select(GoalDBM).where(GoalDBM.id == goal_id, GoalDBM.user_id == current_user.id)
    )
    if goal is None:
        raise NotFoundError("Goal not found.")
    return goal


def get_list(
    db: Session,
    current_user: UserDBM,
    *,
    status: HabitStatus | None = None,
    goal_id: int | None = None,
) -> list[HabitDataResponse]:
    stmt = select(HabitDBM).options(joinedload(HabitDBM.goal)).where(HabitDBM.user_id == current_user.id)
    if status is not None:
        stmt = stmt.where(HabitDBM.status == status)
    if goal_id is not None:
        stmt = stmt.where(HabitDBM.goal_id == goal_id)
    habits = db.scalars(stmt.order_by(HabitDBM.updated_at.desc(), HabitDBM.id.desc())).all()
    if not habits:
        return []

    today = date.today()
    habit_ids = [h.id for h in habits]

    plans = db.scalars(
        select(PlanDBM).where(
            PlanDBM.source_type == "habit",
            PlanDBM.source_id.in_(habit_ids),
            PlanDBM.user_id == current_user.id,
        )
    ).all()
    plan_by_habit_id = {p.source_id: p for p in plans}
    plan_ids = [p.id for p in plans]

    records_by_plan_id: dict[int, list[DailyPlanRecordDBM]] = {}
    if plan_ids:
        for r in db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.plan_id.in_(plan_ids),
                DailyPlanRecordDBM.user_id == current_user.id,
                DailyPlanRecordDBM.scheduled_date <= today,
            )
        ).all():
            records_by_plan_id.setdefault(r.plan_id, []).append(r)

    streak_by_habit_id: dict[int, tuple[int, int]] = {}
    for habit_id, plan in plan_by_habit_id.items():
        streak_by_habit_id[habit_id] = planner_service.compute_streaks(
            plan, records_by_plan_id.get(plan.id, []), today
        )

    return [_serialize(h, streak_by_habit_id.get(h.id, (0, 0))) for h in habits]


def save_habit(
    db: Session,
    current_user: UserDBM,
    data: HabitCreateRequest,
) -> HabitDataResponse:
    goal = _resolve_goal(db, current_user, data.goal_id)

    specific_days = data.specific_days or None
    day_fallback  = data.day_fallback and bool(specific_days) and any(d >= 29 for d in specific_days)

    is_metric = data.planner_type == "metric"
    habit = HabitDBM(
        user_id=current_user.id,
        goal_id=goal.id if goal is not None else None,
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
        category=goal.category if goal is not None else (data.category.strip() if data.category and data.category.strip() else None),
    )
    db.add(habit)
    if goal is not None:
        db.execute(
            update(GoalDBM)
            .where(GoalDBM.id == goal.id)
            .values(
                habits_total=func.coalesce(GoalDBM.habits_total, 0) + 1,
                habits_active=func.coalesce(GoalDBM.habits_active, 0) + 1,
            )
        )
    db.commit()
    db.refresh(habit)
    planner_service.sync_plan_from_habit(db, habit)
    return _serialize(habit, _compute_habit_streak(db, habit))


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

    old_goal_id = habit.goal_id
    old_status = habit.status

    fields = data.model_fields_set

    if "title" in fields and data.title is not None:
        habit.title = data.title.strip()
    if "note" in fields:
        habit.note = data.note.strip() if data.note and data.note.strip() else None
    if "goal_id" in fields:
        goal = _resolve_goal(db, current_user, data.goal_id)
        habit.goal_id = goal.id if goal is not None else None

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
    if "goal_id" in fields or "category" in fields:
        if habit.goal_id is not None:
            linked_goal = db.get(GoalDBM, habit.goal_id)
            habit.category = linked_goal.category if linked_goal is not None else None
        elif "category" in fields:
            habit.category = data.category.strip() if data.category and data.category.strip() else None
        else:
            habit.category = None

    new_goal_id = habit.goal_id
    new_status = habit.status
    goal_id_changed = "goal_id" in fields and old_goal_id != new_goal_id
    status_changed = "status" in fields and old_status != new_status

    if goal_id_changed:
        if old_goal_id is not None:
            db.execute(
                update(GoalDBM)
                .where(GoalDBM.id == old_goal_id, GoalDBM.habits_total > 0)
                .values(habits_total=GoalDBM.habits_total - 1)
            )
            if old_status == "active":
                db.execute(
                    update(GoalDBM)
                    .where(GoalDBM.id == old_goal_id, GoalDBM.habits_active > 0)
                    .values(habits_active=GoalDBM.habits_active - 1)
                )
        if new_goal_id is not None:
            db.execute(
                update(GoalDBM)
                .where(GoalDBM.id == new_goal_id)
                .values(habits_total=func.coalesce(GoalDBM.habits_total, 0) + 1)
            )
            if new_status == "active":
                db.execute(
                    update(GoalDBM)
                    .where(GoalDBM.id == new_goal_id)
                    .values(habits_active=func.coalesce(GoalDBM.habits_active, 0) + 1)
                )
    elif status_changed and new_goal_id is not None:
        if old_status == "active" and new_status != "active":
            db.execute(
                update(GoalDBM)
                .where(GoalDBM.id == new_goal_id, GoalDBM.habits_active > 0)
                .values(habits_active=GoalDBM.habits_active - 1)
            )
        elif old_status != "active" and new_status == "active":
            db.execute(
                update(GoalDBM)
                .where(GoalDBM.id == new_goal_id)
                .values(habits_active=func.coalesce(GoalDBM.habits_active, 0) + 1)
            )

    db.commit()
    db.refresh(habit)
    planner_service.sync_plan_from_habit(db, habit)
    return _serialize(habit, _compute_habit_streak(db, habit))


def get_history(
    db: Session,
    current_user: UserDBM,
    habit_id: int,
    *,
    skip: int = 0,
    limit: int = 30,
) -> HabitHistoryResponse:
    habit = db.scalar(
        select(HabitDBM)
        .options(joinedload(HabitDBM.goal))
        .where(HabitDBM.id == habit_id, HabitDBM.user_id == current_user.id)
    )
    if habit is None:
        raise NotFoundError("Habit not found.")

    plan = db.scalar(
        select(PlanDBM).where(
            PlanDBM.source_type == "habit",
            PlanDBM.source_id == habit_id,
            PlanDBM.user_id == current_user.id,
        )
    )

    goal_in_plan: GoalDataInPlan | None = None
    if habit.goal_id is not None and habit.goal is not None:
        goal_in_plan = GoalDataInPlan(
            id=habit.goal.id,
            title=habit.goal.title,
            category=habit.goal.category,
        )

    habit_response = _serialize(habit, _compute_habit_streak(db, habit))
    empty_stats = HabitHistoryStats(total_records=0, total_done=0, total_missed=0, completion_rate=0.0)

    if plan is None:
        return HabitHistoryResponse(habit=habit_response, records=[], stats=empty_stats, total=0, has_more=False)

    # Aggregate counts in one query — no full table load needed
    stats_row = db.execute(
        select(
            func.count().label("total"),
            func.sum(case((DailyPlanRecordDBM.status == "done", 1), else_=0)).label("total_done"),
            func.sum(case((DailyPlanRecordDBM.status == "missed", 1), else_=0)).label("total_missed"),
        ).where(
            DailyPlanRecordDBM.plan_id == plan.id,
            DailyPlanRecordDBM.user_id == current_user.id,
        )
    ).one()
    total = int(stats_row.total or 0)
    total_done = int(stats_row.total_done or 0)
    total_missed = int(stats_row.total_missed or 0)
    stats = HabitHistoryStats(
        total_records=total,
        total_done=total_done,
        total_missed=total_missed,
        completion_rate=round(total_done / total, 4) if total > 0 else 0.0,
    )

    raw_records = db.scalars(
        select(DailyPlanRecordDBM)
        .where(
            DailyPlanRecordDBM.plan_id == plan.id,
            DailyPlanRecordDBM.user_id == current_user.id,
        )
        .order_by(DailyPlanRecordDBM.scheduled_date.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    history: list[HabitHistoryRecord] = []
    for r in raw_records:
        item = DailyPlanItemResponse(
            plan_id=plan.id,
            source_type="habit",
            source_id=habit_id,
            title=r.title,
            planner_type=r.planner_type,
            planner_target=r.planner_target,
            value_unit=r.value_unit,
            priority=r.priority,
            preferred_time=r.preferred_time,
            specific_time=r.specific_time,
            duration_minutes=r.duration_minutes,
            goal=goal_in_plan,
            saved_data=DailyPlanSavedData(
                record_id=r.id,
                status=r.status,
                current_value=r.actual_value,
                current_streak=0,
                max_streak=0,
                note=r.note or "",
            ),
        )
        history.append(HabitHistoryRecord(date=r.scheduled_date, completed_at=r.completed_at, item=item))

    return HabitHistoryResponse(
        habit=habit_response,
        records=history,
        stats=stats,
        total=total,
        has_more=(skip + limit) < total,
    )


def set_tracking(db: Session, current_user: UserDBM, data: SetTrackingRequest) -> None:
    habits = db.scalars(
        select(HabitDBM).where(
            HabitDBM.user_id == current_user.id,
            HabitDBM.status != "archived",
        )
    ).all()
    enabled_set = set(data.enabled_ids)
    for habit in habits:
        habit.tracking_enabled = habit.id in enabled_set
    db.commit()


def delete_habit(db: Session, current_user: UserDBM, habit_id: int) -> None:
    habit = db.scalar(
        select(HabitDBM).where(
            HabitDBM.id == habit_id,
            HabitDBM.user_id == current_user.id,
        )
    )
    if habit is None:
        raise NotFoundError("Habit not found.")

    goal_id = habit.goal_id
    habit_status = habit.status

    planner_service.deactivate_plan(db, "habit", habit_id)
    db.delete(habit)

    if goal_id is not None:
        db.execute(
            update(GoalDBM)
            .where(GoalDBM.id == goal_id, GoalDBM.habits_total > 0)
            .values(habits_total=GoalDBM.habits_total - 1)
        )
        if habit_status == "active":
            db.execute(
                update(GoalDBM)
                .where(GoalDBM.id == goal_id, GoalDBM.habits_active > 0)
                .values(habits_active=GoalDBM.habits_active - 1)
            )

    db.commit()
