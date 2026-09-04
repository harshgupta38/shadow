"""Repetitive-task business logic."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.enums import GoalStatus, RepetitiveTaskPriority, RepetitiveTaskStatus
from app.models.goal import Goal
from app.models.metric import TrackedMetric
from app.models.repetitive_task import (
    RepetitiveTask,
    RepetitiveTaskGoalLink,
    RepetitiveTaskMetricLink,
)
from app.models.user import User
from app.schemas.repetitive_task import (
    RepetitiveTaskCreate,
    RepetitiveTaskRead,
    RepetitiveTaskRecommendationRead,
    RepetitiveTaskUpdate,
)
from app.services.exceptions import NotFoundError
from app.services.utils import get_owned_or_404


def _normalize_ids(values: list[int]) -> list[int]:
    ordered: list[int] = []
    seen: set[int] = set()
    for value in values:
        if value <= 0 or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _ensure_owned_goal_ids(db: Session, user_id: int, goal_ids: list[int]) -> list[int]:
    normalized = _normalize_ids(goal_ids)
    if not normalized:
        return []

    owned = set(
        db.scalars(
            select(Goal.id).where(Goal.user_id == user_id, Goal.id.in_(normalized))
        )
    )
    if len(owned) != len(normalized):
        raise NotFoundError("Goal not found")
    return normalized


def _ensure_owned_metric_ids(db: Session, user_id: int, metric_ids: list[int]) -> list[int]:
    normalized = _normalize_ids(metric_ids)
    if not normalized:
        return []

    owned = set(
        db.scalars(
            select(TrackedMetric.id).where(
                TrackedMetric.user_id == user_id,
                TrackedMetric.id.in_(normalized),
            )
        )
    )
    if len(owned) != len(normalized):
        raise NotFoundError("Metric not found")
    return normalized


def _link_maps(
    db: Session,
    task_ids: list[int],
) -> tuple[dict[int, list[int]], dict[int, list[int]]]:
    if not task_ids:
        return {}, {}

    goal_map: dict[int, list[int]] = defaultdict(list)
    metric_map: dict[int, list[int]] = defaultdict(list)

    goal_rows = db.execute(
        select(RepetitiveTaskGoalLink.repetitive_task_id, RepetitiveTaskGoalLink.goal_id).where(
            RepetitiveTaskGoalLink.repetitive_task_id.in_(task_ids)
        )
    )
    for task_id, goal_id in goal_rows:
        goal_map[int(task_id)].append(int(goal_id))

    metric_rows = db.execute(
        select(
            RepetitiveTaskMetricLink.repetitive_task_id,
            RepetitiveTaskMetricLink.metric_id,
        ).where(RepetitiveTaskMetricLink.repetitive_task_id.in_(task_ids))
    )
    for task_id, metric_id in metric_rows:
        metric_map[int(task_id)].append(int(metric_id))

    for values in goal_map.values():
        values.sort()
    for values in metric_map.values():
        values.sort()

    return goal_map, metric_map


def _to_read_rows(db: Session, tasks: list[RepetitiveTask]) -> list[RepetitiveTaskRead]:
    task_ids = [task.id for task in tasks]
    goal_map, metric_map = _link_maps(db, task_ids)

    rows: list[RepetitiveTaskRead] = []
    for task in tasks:
        rows.append(
            RepetitiveTaskRead(
                id=task.id,
                name=task.name,
                description=task.description,
                frequencies=list(task.frequencies),
                priority=task.priority,
                status=task.status,
                linked_goal_ids=goal_map.get(task.id, []),
                linked_metric_ids=metric_map.get(task.id, []),
                created_at=task.created_at,
                updated_at=task.updated_at,
            )
        )
    return rows


def _to_single_read(db: Session, task: RepetitiveTask) -> RepetitiveTaskRead:
    return _to_read_rows(db, [task])[0]


def list_tasks(
    db: Session,
    user: User,
    *,
    status: RepetitiveTaskStatus | None = None,
) -> list[RepetitiveTaskRead]:
    stmt = select(RepetitiveTask).where(RepetitiveTask.user_id == user.id)
    if status is not None:
        stmt = stmt.where(RepetitiveTask.status == status)

    tasks = list(db.scalars(stmt.order_by(RepetitiveTask.updated_at.desc(), RepetitiveTask.id.desc())))
    return _to_read_rows(db, tasks)


def create_task(db: Session, user: User, data: RepetitiveTaskCreate) -> RepetitiveTaskRead:
    goal_ids = _ensure_owned_goal_ids(db, user.id, data.linked_goal_ids)
    metric_ids = _ensure_owned_metric_ids(db, user.id, data.linked_metric_ids)

    task = RepetitiveTask(
        user_id=user.id,
        name=data.name.strip(),
        description=data.description,
        frequencies=list(data.frequencies),
        priority=data.priority,
        status=RepetitiveTaskStatus.active,
    )
    db.add(task)
    db.flush()

    if goal_ids:
        db.add_all(
            [
                RepetitiveTaskGoalLink(repetitive_task_id=task.id, goal_id=goal_id)
                for goal_id in goal_ids
            ]
        )
    if metric_ids:
        db.add_all(
            [
                RepetitiveTaskMetricLink(repetitive_task_id=task.id, metric_id=metric_id)
                for metric_id in metric_ids
            ]
        )

    db.commit()
    db.refresh(task)
    return _to_single_read(db, task)


def update_task(
    db: Session,
    user: User,
    task_id: int,
    data: RepetitiveTaskUpdate,
) -> RepetitiveTaskRead:
    task = get_owned_or_404(db, RepetitiveTask, task_id, user.id, name="Repetitive task")
    updates = data.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] is not None:
        task.name = updates["name"].strip()
    if "description" in updates:
        task.description = updates["description"]
    if "frequencies" in updates and updates["frequencies"] is not None:
        task.frequencies = list(updates["frequencies"])
    if "priority" in updates and updates["priority"] is not None:
        task.priority = updates["priority"]
    if "status" in updates and updates["status"] is not None:
        task.status = updates["status"]

    if "linked_goal_ids" in updates:
        goal_ids = _ensure_owned_goal_ids(db, user.id, updates["linked_goal_ids"] or [])
        db.execute(
            delete(RepetitiveTaskGoalLink).where(
                RepetitiveTaskGoalLink.repetitive_task_id == task.id
            )
        )
        if goal_ids:
            db.add_all(
                [
                    RepetitiveTaskGoalLink(repetitive_task_id=task.id, goal_id=goal_id)
                    for goal_id in goal_ids
                ]
            )

    if "linked_metric_ids" in updates:
        metric_ids = _ensure_owned_metric_ids(db, user.id, updates["linked_metric_ids"] or [])
        db.execute(
            delete(RepetitiveTaskMetricLink).where(
                RepetitiveTaskMetricLink.repetitive_task_id == task.id
            )
        )
        if metric_ids:
            db.add_all(
                [
                    RepetitiveTaskMetricLink(repetitive_task_id=task.id, metric_id=metric_id)
                    for metric_id in metric_ids
                ]
            )

    db.commit()
    db.refresh(task)
    return _to_single_read(db, task)


def delete_task(db: Session, user: User, task_id: int) -> None:
    task = get_owned_or_404(db, RepetitiveTask, task_id, user.id, name="Repetitive task")
    db.delete(task)
    db.commit()


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in keywords)


def list_recommendations(
    db: Session,
    user: User,
    *,
    limit: int = 5,
) -> list[RepetitiveTaskRecommendationRead]:
    existing_names = {
        name.lower().strip()
        for name in db.scalars(
            select(RepetitiveTask.name).where(RepetitiveTask.user_id == user.id)
        )
        if name
    }

    goals = list(
        db.scalars(
            select(Goal)
            .where(Goal.user_id == user.id, Goal.status == GoalStatus.active)
            .order_by(Goal.updated_at.desc())
        )
    )
    metrics = list(
        db.scalars(
            select(TrackedMetric)
            .where(TrackedMetric.user_id == user.id, TrackedMetric.active.is_(True))
            .order_by(TrackedMetric.created_at)
        )
    )

    goal_keywords = {
        "workout": ("workout", "fitness", "health", "weight", "gym"),
        "leetcode": ("leetcode", "dsa", "coding", "interview", "google", "sde"),
        "reading": ("read", "learning", "study", "book"),
        "deep_work": ("focus", "deep work", "productivity", "project", "ship"),
    }

    metric_keywords = {
        "workout": ("workout", "exercise", "active", "steps", "fitness"),
        "leetcode": ("leetcode", "problem", "dsa", "coding"),
        "reading": ("read", "book", "learning"),
        "deep_work": ("deep_work", "focus", "pomodoro", "task"),
    }

    def linked_goal_ids(bucket: str) -> list[int]:
        keywords = goal_keywords[bucket]
        ids: list[int] = []
        for goal in goals:
            haystack = " ".join(
                part
                for part in [goal.title, goal.description or "", goal.category or ""]
                if part
            )
            if _contains_any(haystack, keywords):
                ids.append(goal.id)
            if len(ids) >= 3:
                break
        return ids

    def linked_metric_ids(bucket: str) -> list[int]:
        keywords = metric_keywords[bucket]
        ids: list[int] = []
        for metric in metrics:
            haystack = f"{metric.key} {metric.label}"
            if _contains_any(haystack, keywords):
                ids.append(metric.id)
            if len(ids) >= 3:
                break
        return ids

    templates = [
        {
            "name": "Workout routine",
            "description": "Build consistency and energy with focused movement sessions.",
            "frequencies": ["monday", "wednesday", "friday"],
            "priority": RepetitiveTaskPriority.high,
            "rationale": "Consistent movement improves long-term energy and follow-through.",
            "bucket": "workout",
        },
        {
            "name": "LeetCode practice",
            "description": "Solve and review interview-style coding problems.",
            "frequencies": ["weekdays"],
            "priority": RepetitiveTaskPriority.critical,
            "rationale": "Frequent practice compounds interview readiness.",
            "bucket": "leetcode",
        },
        {
            "name": "Reading block",
            "description": "Read 20-30 minutes of growth or career material.",
            "frequencies": ["daily"],
            "priority": RepetitiveTaskPriority.medium,
            "rationale": "Small daily learning blocks are easier to sustain.",
            "bucket": "reading",
        },
        {
            "name": "Deep work block",
            "description": "Protect distraction-free focus for your highest-impact work.",
            "frequencies": ["weekdays"],
            "priority": RepetitiveTaskPriority.high,
            "rationale": "Dedicated focus blocks improve execution speed and quality.",
            "bucket": "deep_work",
        },
    ]

    recommendations: list[RepetitiveTaskRecommendationRead] = []
    for template in templates:
        normalized_name = template["name"].lower().strip()
        if normalized_name in existing_names:
            continue

        goal_ids = linked_goal_ids(template["bucket"])
        metric_ids = linked_metric_ids(template["bucket"])

        recommendations.append(
            RepetitiveTaskRecommendationRead(
                name=template["name"],
                description=template["description"],
                frequencies=template["frequencies"],
                priority=template["priority"],
                rationale=template["rationale"],
                linked_goal_ids=goal_ids,
                linked_metric_ids=metric_ids,
            )
        )

        if len(recommendations) >= limit:
            break

    return recommendations
