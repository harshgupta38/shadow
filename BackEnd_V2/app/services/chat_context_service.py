from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.llm.config import llm_settings
from app.models.chat import Message
from app.models.goal import Goal
from app.models.milestone import Milestone
from app.models.task import Task
from app.models.user import User


@dataclass(frozen=True)
class ChatContextResult:
    mode: str
    stable_context: str
    conversation_summary: str
    live_context: str
    recent_messages: list[tuple[str, str]]
    max_tokens: int | None = None


_GOAL_KEYWORDS = (
    "goal",
    "goals",
    "milestone",
    "milestones",
    "progress",
    "accomplish",
    "achievement",
    "google",
    "dsa",
    "leetcode",
    "interview",
)

_DAILY_PLANNING_KEYWORDS = (
    "today",
    "tomorrow",
    "plan",
    "schedule",
    "task",
    "tasks",
    "what should i do",
    "work on",
    "focus",
)

_GENERAL_KEYWORDS = (
    "joke",
    "hello",
    "hi",
    "hey",
    "how are you",
)


def select_chat_mode(message: str) -> str:
    lowered = message.lower()

    if any(keyword in lowered for keyword in _GENERAL_KEYWORDS):
        return "general_conversation"

    if any(keyword in lowered for keyword in _DAILY_PLANNING_KEYWORDS):
        return "daily_planning"

    if any(keyword in lowered for keyword in _GOAL_KEYWORDS):
        if any(keyword in lowered for keyword in ("progress", "accomplish", "how am i doing", "how am i progressing")):
            return "progress_related"
        return "goal_related"

    return "general_conversation"


def _format_goal(goal: Goal) -> str:
    return (
        f"- Goal #{goal.id}: {goal.title} | status={goal.status} | category={goal.category} | "
        f"target_date={goal.target_date.isoformat()} | milestones={goal.milestones_completed}/{goal.milestones_total} | "
        f"habits={goal.habits_active}/{goal.habits_total}"
    )


def _format_milestone(milestone: Milestone) -> str:
    parts = [
        f"- Milestone #{milestone.id}: {milestone.title}",
        f"goal_id={milestone.goal_id}",
        f"status={milestone.status}",
    ]
    if milestone.target_date is not None:
        parts.append(f"target_date={milestone.target_date.isoformat()}")
    if milestone.total_tasks or milestone.completed_tasks:
        parts.append(f"tasks={milestone.completed_tasks}/{milestone.total_tasks}")
    return " | ".join(parts)


def _format_task(task: Task) -> str:
    parts = [
        f"- Task #{task.id}: {task.title}",
        f"goal_id={task.goal_id}",
        f"milestone_id={task.milestone_id}",
        f"status={task.status}",
        f"type={task.task_type}",
    ]
    if task.planning_enabled:
        parts.append("planning_enabled=true")
    if task.current_value is not None or task.target_value is not None:
        parts.append(f"progress={task.current_value if task.current_value is not None else 0}/{task.target_value if task.target_value is not None else 0}")
    return " | ".join(parts)


def _goal_filters(message: str) -> list:
    lowered = message.lower()
    conditions = []
    for keyword in ("google", "dsa", "leetcode", "interview"):
        if keyword in lowered:
            conditions.append(or_(Goal.title.ilike(f"%{keyword}%"), Goal.summary.ilike(f"%{keyword}%"), Goal.category.ilike(f"%{keyword}%")))
    return conditions


def build_chat_context(
    db: Session,
    current_user: User,
    conversation_id: int,
    current_message_id: int,
    message: str,
    conversation_summary: str,
) -> ChatContextResult:
    mode = select_chat_mode(message)
    stable_context = llm_settings.llm_system_prompt.strip()

    goals_query = select(Goal).where(Goal.user_id == current_user.id)
    goal_filters = _goal_filters(message)
    if goal_filters:
        goals_query = goals_query.where(or_(*goal_filters))

    goals = list(db.scalars(goals_query.order_by(Goal.updated_at.desc()).limit(3)).all())
    if not goals and mode in {"goal_related", "progress_related", "daily_planning"}:
        goals = list(db.scalars(select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.updated_at.desc()).limit(3)).all())

    goal_ids = [goal.id for goal in goals]

    milestones: list[Milestone] = []
    tasks: list[Task] = []
    if goal_ids:
        milestones = list(
            db.scalars(
                select(Milestone)
                .where(and_(Milestone.user_id == current_user.id, Milestone.goal_id.in_(goal_ids)))
                .order_by(Milestone.position.asc(), Milestone.id.asc())
                .limit(6)
            ).all()
        )
        milestone_ids = [milestone.id for milestone in milestones]
        if milestone_ids:
            task_query = select(Task).where(
                and_(Task.user_id == current_user.id, Task.milestone_id.in_(milestone_ids))
            )
            if mode == "daily_planning":
                task_query = task_query.where(Task.status != "Completed")
            tasks = list(
                db.scalars(task_query.order_by(Task.position.asc(), Task.id.asc()).limit(8)).all()
            )

    live_sections: list[str] = []
    if goals:
        live_sections.append("GOALS")
        live_sections.extend(_format_goal(goal) for goal in goals)
    if milestones:
        live_sections.append("MILESTONES")
        live_sections.extend(_format_milestone(milestone) for milestone in milestones)
    if tasks:
        live_sections.append("TASKS")
        live_sections.extend(_format_task(task) for task in tasks)

    live_context = "\n".join(live_sections).strip()

    recent_messages = _load_recent_message_pairs(db, conversation_id, current_message_id)

    return ChatContextResult(
        mode=mode,
        stable_context=stable_context,
        conversation_summary=conversation_summary.strip(),
        live_context=live_context,
        recent_messages=recent_messages,
        max_tokens=llm_settings.chat_recent_message_limit,
    )


def _load_recent_message_pairs(
    db: Session,
    conversation_id: int,
    current_message_id: int,
) -> list[tuple[str, str]]:
    rows = list(
        db.scalars(
            select(Message)
            .where(
                Message.conversation_id == conversation_id,
                Message.id < current_message_id,
            )
            .order_by(Message.id.desc())
            .limit(llm_settings.chat_recent_message_limit)
        ).all()
    )
    rows.reverse()
    return [(row.role, row.content) for row in rows]