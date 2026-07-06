"""Goal & milestone business logic (progress auto-recomputed from milestones)."""

from __future__ import annotations

import datetime
import json
from calendar import monthrange

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import generate_goal_draft_from_prompt, repair_goal_draft_json
from app.llm.base import LLMProvider
from app.memory.context import compile_user_context
from app.models.base import utcnow
from app.models.enums import GoalStatus, MilestoneStatus, PlannedTaskStatus
from app.models.goal import Goal
from app.models.milestone import Milestone
from app.models.planned_task import PlannedTask
from app.models.repetitive_task import RepetitiveTask, RepetitiveTaskGoalLink
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalDraftRead, GoalLinkedRepetitiveTaskRead, GoalUpdate
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate
from app.services import settings_service
from app.services.exceptions import AppError, NotFoundError
from app.services.utils import get_owned_or_404

_HISTORY_LOOKBACK_DAYS = 45


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
        return "\n".join(lines[1:-1]).strip()
    return text


def _parse_json_dict(raw: str) -> dict | None:
    text = _strip_markdown_fence(raw)
    if not text:
        return None

    try:
        payload = json.loads(text)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                payload = json.loads(text[start : end + 1])
                if isinstance(payload, dict):
                    return payload
            except json.JSONDecodeError:
                return None
    return None


def _parse_target_date(value: str | None) -> datetime.datetime | None:
    if not value:
        return None

    raw = value.strip()
    if not raw:
        return None

    if len(raw) == 10:
        try:
            parsed_date = datetime.date.fromisoformat(raw)
            return datetime.datetime(
                parsed_date.year,
                parsed_date.month,
                parsed_date.day,
                tzinfo=datetime.timezone.utc,
            )
        except ValueError:
            return None

    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed.astimezone(datetime.timezone.utc)


def _normalize_task_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _frequency_matches_day(frequency: str, on_date: datetime.date) -> bool:
    normalized = frequency.strip().lower()
    weekday = on_date.weekday()
    if normalized == "daily":
        return True
    if normalized == "weekly":
        return weekday == 0
    if normalized == "monthly":
        return on_date.day == 1
    if normalized == "weekdays":
        return weekday < 5
    if normalized == "weekends":
        return weekday >= 5
    if normalized == "monday":
        return weekday == 0
    if normalized == "tuesday":
        return weekday == 1
    if normalized == "wednesday":
        return weekday == 2
    if normalized == "thursday":
        return weekday == 3
    if normalized == "friday":
        return weekday == 4
    if normalized == "saturday":
        return weekday == 5
    if normalized == "sunday":
        return weekday == 6
    if normalized == "first_of_month":
        return on_date.day == 1
    if normalized == "end_of_month":
        return on_date.day == monthrange(on_date.year, on_date.month)[1]
    return False


def _status_by_date(rows: list[PlannedTask]) -> dict[datetime.date, PlannedTaskStatus]:
    result: dict[datetime.date, PlannedTaskStatus] = {}
    for row in rows:
        existing = result.get(row.date)
        if existing == PlannedTaskStatus.done:
            continue
        if row.status == PlannedTaskStatus.done or existing is None:
            result[row.date] = row.status
    return result


def _streak_for_repetitive(
    repetitive: RepetitiveTask,
    history_rows: list[PlannedTask],
    *,
    on_date: datetime.date,
) -> tuple[int, int]:
    status_map = _status_by_date(history_rows)
    floor = on_date - datetime.timedelta(days=_HISTORY_LOOKBACK_DAYS)

    max_streak = 0
    running_streak = 0
    cursor = floor
    while cursor <= on_date:
        if any(_frequency_matches_day(freq, cursor) for freq in repetitive.frequencies):
            if status_map.get(cursor) == PlannedTaskStatus.done:
                running_streak += 1
                if running_streak > max_streak:
                    max_streak = running_streak
            else:
                running_streak = 0
        cursor += datetime.timedelta(days=1)

    current_streak = 0
    cursor = on_date
    while cursor >= floor:
        if any(_frequency_matches_day(freq, cursor) for freq in repetitive.frequencies):
            if status_map.get(cursor) == PlannedTaskStatus.done:
                current_streak += 1
            else:
                break
        cursor -= datetime.timedelta(days=1)

    return current_streak, max_streak


def draft_goal_from_prompt(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    prompt: str,
) -> GoalDraftRead:
    preferred_model = settings_service.get_effective_ai_model(db, user)
    user_context = compile_user_context(db, user)
    raw = generate_goal_draft_from_prompt(
        provider,
        prompt_text=prompt,
        user_context=user_context,
        model=preferred_model,
    )

    payload = _parse_json_dict(raw)
    if payload is None:
        repaired = repair_goal_draft_json(
            provider,
            prompt_text=prompt,
            malformed_output=raw,
            user_context=user_context,
            model=preferred_model,
        )
        payload = _parse_json_dict(repaired)

    if payload is None:
        retry_raw = generate_goal_draft_from_prompt(
            provider,
            prompt_text=prompt,
            user_context=user_context,
            model=preferred_model,
        )
        payload = _parse_json_dict(retry_raw)

        if payload is None:
            retry_repaired = repair_goal_draft_json(
                provider,
                prompt_text=prompt,
                malformed_output=retry_raw,
                user_context=user_context,
                model=preferred_model,
            )
            payload = _parse_json_dict(retry_repaired)

    if payload is None:
        raise AppError("Shadow could not structure this goal yet. Please try again.")

    title_raw = payload.get("title")
    title = title_raw.strip() if isinstance(title_raw, str) else ""
    if not title:
        raise AppError("Shadow could not infer a goal title. Please add more detail.")

    description_raw = payload.get("description")
    description = description_raw.strip() if isinstance(description_raw, str) else None
    if description == "":
        description = None

    category_raw = payload.get("category")
    category = category_raw.strip() if isinstance(category_raw, str) else None
    if category == "":
        category = None

    target_date_raw = payload.get("target_date")
    target_date = _parse_target_date(target_date_raw if isinstance(target_date_raw, str) else None)

    try:
        return GoalDraftRead(
            title=title,
            description=description,
            category=category,
            target_date=target_date,
        )
    except Exception as exc:
        raise AppError("Shadow generated an invalid goal draft. Please try again.") from exc


# ── Goals ─────────────────────────────────────────────────────
def list_goals(db: Session, user: User, *, status: GoalStatus | None = None) -> list[Goal]:
    stmt = select(Goal).where(Goal.user_id == user.id)
    if status is not None:
        stmt = stmt.where(Goal.status == status)
    return list(db.scalars(stmt.order_by(Goal.created_at.desc())))


def create_goal(db: Session, user: User, data: GoalCreate) -> Goal:
    goal = Goal(
        user_id=user.id,
        title=data.title,
        description=data.description,
        category=data.category,
        target_date=data.target_date,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def get_goal(db: Session, user: User, goal_id: int) -> Goal:
    return get_owned_or_404(db, Goal, goal_id, user.id, name="Goal")


def list_linked_repetitive_tasks(
    db: Session,
    user: User,
    goal_id: int,
) -> list[GoalLinkedRepetitiveTaskRead]:
    goal = get_goal(db, user, goal_id)

    linked_tasks = list(
        db.scalars(
            select(RepetitiveTask)
            .join(
                RepetitiveTaskGoalLink,
                RepetitiveTaskGoalLink.repetitive_task_id == RepetitiveTask.id,
            )
            .where(
                RepetitiveTask.user_id == user.id,
                RepetitiveTaskGoalLink.goal_id == goal.id,
            )
            .order_by(RepetitiveTask.updated_at.desc(), RepetitiveTask.id.desc())
        )
    )

    if not linked_tasks:
        return []

    today = datetime.date.today()
    history_start = today - datetime.timedelta(days=_HISTORY_LOOKBACK_DAYS)
    history_rows = list(
        db.scalars(
            select(PlannedTask)
            .where(
                PlannedTask.user_id == user.id,
                PlannedTask.date >= history_start,
                PlannedTask.date <= today,
            )
            .order_by(PlannedTask.date.desc(), PlannedTask.id.desc())
        )
    )

    title_keys = {
        _normalize_task_name(task.name)
        for task in linked_tasks
        if _normalize_task_name(task.name)
    }
    history_by_title: dict[str, list[PlannedTask]] = {}
    for row in history_rows:
        title_key = _normalize_task_name(row.title)
        if not title_key or title_key not in title_keys:
            continue
        history_by_title.setdefault(title_key, []).append(row)

    response_rows: list[GoalLinkedRepetitiveTaskRead] = []
    for task in linked_tasks:
        title_key = _normalize_task_name(task.name)
        current_streak, max_streak = _streak_for_repetitive(
            task,
            history_by_title.get(title_key, []),
            on_date=today,
        )
        response_rows.append(
            GoalLinkedRepetitiveTaskRead(
                id=task.id,
                name=task.name,
                description=task.description,
                frequencies=task.frequencies,
                category=goal.category,
                priority=task.priority,
                status=task.status,
                current_streak_days=current_streak,
                max_streak_days=max_streak,
            )
        )

    return response_rows


def update_goal(db: Session, user: User, goal_id: int, data: GoalUpdate) -> Goal:
    goal = get_goal(db, user, goal_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, user: User, goal_id: int) -> None:
    goal = get_goal(db, user, goal_id)
    db.delete(goal)
    db.commit()


# ── Milestones ────────────────────────────────────────────────
def _get_milestone_owned(db: Session, user: User, milestone_id: int) -> Milestone:
    milestone = db.get(Milestone, milestone_id)
    if milestone is None:
        raise NotFoundError("Milestone not found")
    # Ownership flows through the parent goal.
    goal = db.get(Goal, milestone.goal_id)
    if goal is None or goal.user_id != user.id:
        raise NotFoundError("Milestone not found")
    return milestone


def recompute_progress(db: Session, goal_id: int) -> None:
    """Set goal.progress from milestone completion (no-op if none)."""
    milestones = list(db.scalars(select(Milestone).where(Milestone.goal_id == goal_id)))
    if not milestones:
        return
    done = sum(1 for m in milestones if m.status == MilestoneStatus.done)
    goal = db.get(Goal, goal_id)
    if goal is not None:
        goal.progress = round(done * 100 / len(milestones))
        db.commit()


def list_milestones(db: Session, user: User, goal_id: int) -> list[Milestone]:
    goal = get_goal(db, user, goal_id)
    return list(
        db.scalars(
            select(Milestone)
            .where(Milestone.goal_id == goal.id)
            .order_by(Milestone.order, Milestone.id)
        )
    )


def add_milestone(db: Session, user: User, goal_id: int, data: MilestoneCreate) -> Milestone:
    goal = get_goal(db, user, goal_id)
    milestone = Milestone(
        goal_id=goal.id,
        title=data.title,
        description=data.description,
        details=[item.model_dump() for item in data.details] if data.details else None,
        status=data.status,
        order=data.order,
        due_date=data.due_date,
    )
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    recompute_progress(db, goal.id)
    return milestone


def update_milestone(db: Session, user: User, milestone_id: int, data: MilestoneUpdate) -> Milestone:
    milestone = _get_milestone_owned(db, user, milestone_id)
    updates = data.model_dump(exclude_unset=True)
    if "details" in updates:
        details = updates.pop("details")
        milestone.details = list(details) if details else None
    for field, value in updates.items():
        setattr(milestone, field, value)
    # Keep completed_at in sync with status changes.
    if "status" in updates:
        if milestone.status == MilestoneStatus.done and milestone.completed_at is None:
            milestone.completed_at = utcnow()
        elif milestone.status != MilestoneStatus.done:
            milestone.completed_at = None
    db.commit()
    db.refresh(milestone)
    recompute_progress(db, milestone.goal_id)
    return milestone


def delete_milestone(db: Session, user: User, milestone_id: int) -> None:
    milestone = _get_milestone_owned(db, user, milestone_id)
    goal_id = milestone.goal_id
    db.delete(milestone)
    db.commit()
    recompute_progress(db, goal_id)
