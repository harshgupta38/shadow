"""Chat business logic — sessions, messages, and AI replies via agents."""

from __future__ import annotations

import json
import logging
import re
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import (
    generate_chat_reply,
    generate_chat_title,
    propose_chat_actions,
)
from app.llm.base import LLMMessage, LLMProvider
from app.memory.context import compile_user_context
from app.models.base import utcnow
from app.models.chat import ChatMessage, ChatSession
from app.models.enums import AgentType, AssistantActionConfidence, ChatRole, GoalStatus
from app.models.goal import Goal
from app.models.metric import TrackedMetric
from app.models.user import User
from app.schemas.activity import ActivityLogCreate
from app.schemas.chat import (
    AssistantProposedAction,
    ChatActionExecuteResponse,
    ChatSessionCreate,
    GoalsAddMilestoneAction,
    GoalsCreateGoalAction,
    PlanCreateTaskAction,
    TrackCreateMetricAction,
    TrackLogMetricAction,
)
from app.schemas.goal import GoalCreate
from app.schemas.metric import MetricCreate
from app.schemas.milestone import MilestoneCreate
from app.schemas.plan import PlannedTaskCreate
from app.services import goal_service, metric_service, plan_service, settings_service
from app.services.exceptions import AppError
from app.services.utils import get_owned_or_404

logger = logging.getLogger(__name__)

_ACTION_LIST_ADAPTER = TypeAdapter(list[AssistantProposedAction])
_AUTO_EXECUTABLE_TYPES = {
    "plan.create_task",
    "goals.create_goal",
    "goals.add_milestone",
    "track.create_metric",
    "track.log_metric",
}
_GOAL_CONTEXT_MARKER = "[goal_context]"

_AGENT_DEFAULT_TITLES: dict[AgentType, str] = {
    AgentType.general: "Shadow",
    AgentType.goal_coach: "Goal Coach",
    AgentType.career_advisor: "Career Advisor",
    AgentType.daily_checkin: "Daily Check-in",
    AgentType.progress_analyst: "Progress Analyst",
    AgentType.onboarding: "Onboarding Interviewer",
}


def _should_generate_title(session: ChatSession) -> bool:
    title = (session.title or "").strip()
    if not title or title == "New chat":
        return True
    return title == _AGENT_DEFAULT_TITLES.get(session.agent_type)


def _normalise_title(raw: str, fallback: str) -> str:
    line = (raw or "").splitlines()[0].strip() if raw else ""
    line = line.strip("`*_#>- '\"[]()")
    line = " ".join(line.split())
    if not line:
        return fallback

    words = line.split(" ")
    if len(words) > 4:
        line = " ".join(words[:4])
    if len(line) > 64:
        line = line[:64].rstrip()
    return line or fallback


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
        return "\n".join(lines[1:-1]).strip()
    return text


def _is_auto_executable(action: AssistantProposedAction) -> bool:
    return (
        action.confidence == AssistantActionConfidence.high
        and not action.destructive
        and action.type in _AUTO_EXECUTABLE_TYPES
    )


def _fallback_action_title(action: AssistantProposedAction) -> str:
    if isinstance(action, PlanCreateTaskAction):
        return f"Create task: {action.args.title}"
    if isinstance(action, GoalsCreateGoalAction):
        return f"Create goal: {action.args.title}"
    if isinstance(action, GoalsAddMilestoneAction):
        return f"Add milestone: {action.args.title}"
    if isinstance(action, TrackCreateMetricAction):
        return f"Create metric: {action.args.label}"
    if isinstance(action, TrackLogMetricAction):
        return f"Log metric: {action.args.key}"
    return "Run assistant action"


def _parse_proposed_actions(raw: str) -> list[AssistantProposedAction]:
    if not raw.strip():
        return []

    try:
        payload = json.loads(_strip_markdown_fence(raw))
    except json.JSONDecodeError:
        return []

    if isinstance(payload, dict):
        candidates = payload.get("actions", [])
    elif isinstance(payload, list):
        candidates = payload
    else:
        return []

    if not isinstance(candidates, list):
        return []

    prepared: list[dict] = []
    for item in candidates[:3]:
        if not isinstance(item, dict):
            continue
        row = dict(item)
        row.setdefault("id", f"act_{uuid4().hex[:10]}")
        row.setdefault("rationale", "")
        row.setdefault("confidence", AssistantActionConfidence.medium.value)
        row.setdefault("requires_confirmation", True)
        row.setdefault("destructive", False)
        prepared.append(row)

    if not prepared:
        return []

    try:
        actions = _ACTION_LIST_ADAPTER.validate_python(prepared)
    except ValidationError:
        logger.warning("Failed to validate proposed chat actions")
        return []

    normalized: list[AssistantProposedAction] = []
    for action in actions:
        action.title = action.title.strip()
        action.rationale = action.rationale.strip()
        if not action.title:
            action.title = _fallback_action_title(action)
        action.requires_confirmation = not _is_auto_executable(action)
        if action.destructive:
            action.requires_confirmation = True
        normalized.append(action)
    return normalized


def _extract_goal_context(content: str) -> tuple[str, int | None, str | None]:
    if _GOAL_CONTEXT_MARKER not in content:
        return content.strip(), None, None

    visible, context_block = content.split(_GOAL_CONTEXT_MARKER, 1)
    clean_content = visible.strip()
    goal_id: int | None = None
    goal_title: str | None = None

    for raw_line in context_block.splitlines():
        line = raw_line.strip()
        if line.startswith("goal_id="):
            value = line.split("=", 1)[1].strip()
            if value.isdigit():
                goal_id = int(value)
        elif line.startswith("goal_title="):
            value = line.split("=", 1)[1].strip()
            if value:
                goal_title = value

    return clean_content, goal_id, goal_title


def _is_goal_breakdown_request(text: str) -> bool:
    lowered = text.lower()
    if "milestone" in lowered:
        return True
    if "break" in lowered and "goal" in lowered:
        return True
    if "convert" in lowered and "goal" in lowered:
        return True
    if "goal" in lowered and "steps" in lowered:
        return True
    return False


def _goal_title_matches_text(goal_title: str, text: str) -> bool:
    lowered_text = text.lower()
    lowered_goal = goal_title.lower()
    if lowered_goal in lowered_text:
        return True
    keywords = [part for part in re.findall(r"[a-z0-9]+", lowered_goal) if len(part) >= 4]
    return any(word in lowered_text for word in keywords)


def _active_goals_for_coaching(db: Session, user: User) -> list[Goal]:
    goals = list(
        db.scalars(
            select(Goal)
            .where(Goal.user_id == user.id, Goal.status == GoalStatus.active)
            .order_by(Goal.created_at.desc())
        )
    )
    if goals:
        return goals

    # Fallback when a user has no active goals but still wants goal coaching.
    return list(
        db.scalars(
            select(Goal)
            .where(
                Goal.user_id == user.id,
                Goal.status.in_([GoalStatus.paused, GoalStatus.completed]),
            )
            .order_by(Goal.created_at.desc())
        )
    )


def _goal_disambiguation_reply(goals: list[Goal]) -> str:
    listed = "\n".join(f"- {goal.title}" for goal in goals[:10])
    return (
        "I can break a goal into milestones, but you have multiple goals right now. "
        "Tell me which goal to focus on.\n\n"
        "Your current goals:\n"
        f"{listed}"
    )


def _resolve_goal_coach_focus(
    db: Session,
    user: User,
    session: ChatSession,
    user_content: str,
    marker_goal_id: int | None,
    marker_goal_title: str | None,
) -> tuple[Goal | None, str | None]:
    if session.agent_type != AgentType.goal_coach:
        return None, None

    breakdown_request = _is_goal_breakdown_request(user_content)

    goals = _active_goals_for_coaching(db, user)
    if session.goal_id is not None:
        session_goal = next((goal for goal in goals if goal.id == session.goal_id), None)
        if session_goal is not None:
            return session_goal, None
        # Goal was deleted or is no longer eligible for focus in this session.
        session.goal_id = None

    if not goals:
        return None, None

    explicit_matches = [goal for goal in goals if _goal_title_matches_text(goal.title, user_content)]
    if len(explicit_matches) == 1:
        session.goal_id = explicit_matches[0].id
        return explicit_matches[0], None
    if len(explicit_matches) > 1 and breakdown_request:
        return None, _goal_disambiguation_reply(explicit_matches)

    marker_goal: Goal | None = None
    if marker_goal_id is not None:
        marker_goal = next((goal for goal in goals if goal.id == marker_goal_id), None)

    if marker_goal is None and marker_goal_title:
        lowered_marker_title = marker_goal_title.lower()
        marker_goal = next((goal for goal in goals if goal.title.lower() == lowered_marker_title), None)

    if marker_goal is not None:
        session.goal_id = marker_goal.id
        return marker_goal, None

    if len(goals) == 1:
        session.goal_id = goals[0].id
        return goals[0], None
    if breakdown_request:
        return None, _goal_disambiguation_reply(goals)
    return None, None


def _with_goal_focus_context(user_context: str, goal: Goal | None) -> str:
    if goal is None:
        return user_context

    focus_lines = [
        "## Goal focus for this chat",
        f"- Goal ID: {goal.id}",
        f"- Goal title: {goal.title}",
    ]
    if goal.description:
        focus_lines.append(f"- Goal description: {goal.description}")
    if goal.category:
        focus_lines.append(f"- Goal category: {goal.category}")
    if goal.target_date is not None:
        focus_lines.append(f"- Goal target date: {goal.target_date.isoformat()}")
    focus_lines.extend(
        [
            f"- Goal status: {goal.status.value}",
            f"- Goal progress: {goal.progress}%",
            "- Treat this as the active goal for milestone breakdowns unless the user explicitly switches goals.",
        ]
    )
    focus_block = "\n".join(focus_lines)
    return f"{user_context}\n\n{focus_block}" if user_context else focus_block


def _execute_plan_create_task(
    db: Session, user: User, action: PlanCreateTaskAction
) -> ChatActionExecuteResponse:
    task = plan_service.create_task(
        db,
        user,
        PlannedTaskCreate(**action.args.model_dump()),
    )
    return ChatActionExecuteResponse(
        status="executed",
        message=f"Task '{task.title}' was added to your plan.",
        action=action,
        link="/plan",
        entity_id=task.id,
    )


def _execute_goals_create_goal(
    db: Session, user: User, action: GoalsCreateGoalAction
) -> ChatActionExecuteResponse:
    goal = goal_service.create_goal(
        db,
        user,
        GoalCreate(**action.args.model_dump()),
    )
    return ChatActionExecuteResponse(
        status="executed",
        message=f"Goal '{goal.title}' was created.",
        action=action,
        link=f"/goals/{goal.id}",
        entity_id=goal.id,
    )


def _execute_goals_add_milestone(
    db: Session, user: User, action: GoalsAddMilestoneAction
) -> ChatActionExecuteResponse:
    milestone = goal_service.add_milestone(
        db,
        user,
        action.args.goal_id,
        MilestoneCreate(
            title=action.args.title,
            description=action.args.description,
            order=action.args.order,
            due_date=action.args.due_date,
        ),
    )
    return ChatActionExecuteResponse(
        status="executed",
        message=f"Milestone '{milestone.title}' was added.",
        action=action,
        link=f"/goals/{milestone.goal_id}",
        entity_id=milestone.id,
    )


def _execute_track_create_metric(
    db: Session, user: User, action: TrackCreateMetricAction
) -> ChatActionExecuteResponse:
    metric = metric_service.create_metric(
        db,
        user,
        MetricCreate(**action.args.model_dump()),
    )
    return ChatActionExecuteResponse(
        status="executed",
        message=f"Metric '{metric.label}' was created.",
        action=action,
        link="/track",
        entity_id=metric.id,
    )


def _execute_track_log_metric(
    db: Session, user: User, action: TrackLogMetricAction
) -> ChatActionExecuteResponse:
    metric = db.scalar(
        select(TrackedMetric).where(
            TrackedMetric.user_id == user.id,
            TrackedMetric.key == action.args.key,
        )
    )
    if metric is None:
        return ChatActionExecuteResponse(
            status="failed",
            message=(
                f"Metric '{action.args.key}' was not found. "
                "Create it first or choose an existing metric key."
            ),
            action=action,
            link="/track",
        )

    log = metric_service.add_log(
        db,
        user,
        metric.id,
        ActivityLogCreate(
            value=action.args.value,
            date=action.args.date,
            note=action.args.note,
        ),
    )
    return ChatActionExecuteResponse(
        status="executed",
        message=f"Logged {log.value:g} for {metric.label}.",
        action=action,
        link="/track",
        entity_id=log.id,
    )


def list_sessions(db: Session, user: User) -> list[ChatSession]:
    return list(
        db.scalars(
            select(ChatSession)
            .where(ChatSession.user_id == user.id)
            .order_by(ChatSession.updated_at.desc())
        )
    )


def create_session(db: Session, user: User, data: ChatSessionCreate) -> ChatSession:
    focus_goal: Goal | None = None
    if data.goal_id is not None:
        if data.agent_type != AgentType.goal_coach:
            raise AppError("goal_id is only supported for goal coach sessions.")
        focus_goal = get_owned_or_404(db, Goal, data.goal_id, user.id, name="Goal")

    title = data.title.strip() if data.title else "New chat"
    if (
        focus_goal is not None
        and title in {"", "New chat", _AGENT_DEFAULT_TITLES[AgentType.goal_coach]}
    ):
        title = focus_goal.title

    session = ChatSession(
        user_id=user.id,
        agent_type=data.agent_type,
        title=title or "New chat",
        goal_id=focus_goal.id if focus_goal is not None else None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, user: User, session_id: int) -> ChatSession:
    return get_owned_or_404(db, ChatSession, session_id, user.id, name="Chat session")


def delete_session(db: Session, user: User, session_id: int) -> None:
    session = get_session(db, user, session_id)
    db.delete(session)
    db.commit()


def list_messages(db: Session, user: User, session_id: int) -> list[ChatMessage]:
    session = get_session(db, user, session_id)
    return list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at, ChatMessage.id)
        )
    )


def send_message(
    db: Session,
    user: User,
    session_id: int,
    content: str,
    provider: LLMProvider,
) -> tuple[ChatMessage, ChatMessage, ChatSession, list[AssistantProposedAction]]:
    """Persist the user message, generate an AI reply, persist and return both."""
    session = get_session(db, user, session_id)
    user_content, marker_goal_id, marker_goal_title = _extract_goal_context(content)
    focus_goal, disambiguation_reply = _resolve_goal_coach_focus(
        db,
        user,
        session,
        user_content,
        marker_goal_id,
        marker_goal_title,
    )

    user_message = ChatMessage(
        session_id=session.id,
        role=ChatRole.user,
        content=user_content,
        agent_type=session.agent_type,
    )
    db.add(user_message)
    db.commit()
    db.refresh(user_message)

    history_rows = list(
        db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at, ChatMessage.id)
        )
    )
    history = [LLMMessage(role=row.role.value, content=row.content) for row in history_rows]
    preferred_model = settings_service.get_effective_ai_model(db, user)
    user_context = _with_goal_focus_context(compile_user_context(db, user), focus_goal)

    used_model_reply = disambiguation_reply is None

    if disambiguation_reply is None:
        reply = generate_chat_reply(
            provider,
            agent_type=session.agent_type,
            history=history,
            user_context=user_context,
            model=preferred_model,
        )
    else:
        reply = disambiguation_reply

    assistant_message = ChatMessage(
        session_id=session.id,
        role=ChatRole.assistant,
        content=reply,
        agent_type=session.agent_type,
    )
    db.add(assistant_message)
    session.updated_at = utcnow()  # touch session ordering
    reply_history = [*history, LLMMessage(role=ChatRole.assistant.value, content=reply)]

    if used_model_reply and _should_generate_title(session):
        try:
            raw_title = generate_chat_title(
                provider,
                agent_type=session.agent_type,
                history=reply_history,
                user_context=user_context,
                model=preferred_model,
            )
            session.title = _normalise_title(raw_title, fallback=session.title)
        except Exception:
            logger.warning("Failed to auto-generate chat title for session_id=%s", session.id)

    proposed_actions: list[AssistantProposedAction] = []
    if used_model_reply:
        try:
            raw_actions = propose_chat_actions(
                provider,
                agent_type=session.agent_type,
                history=reply_history,
                user_context=user_context,
                model=preferred_model,
            )
            proposed_actions = _parse_proposed_actions(raw_actions)
        except Exception:
            logger.warning("Failed to generate proposed actions for session_id=%s", session.id)

    db.commit()
    db.refresh(assistant_message)
    db.refresh(session)
    return user_message, assistant_message, session, proposed_actions


def execute_action(
    db: Session,
    user: User,
    session_id: int,
    action: AssistantProposedAction,
    *,
    confirmed: bool = False,
) -> ChatActionExecuteResponse:
    """Execute a proposed assistant action within an owned chat session."""
    get_session(db, user, session_id)

    if action.requires_confirmation and not confirmed:
        return ChatActionExecuteResponse(
            status="rejected",
            message="This action needs confirmation before execution.",
            action=action,
        )

    try:
        if isinstance(action, PlanCreateTaskAction):
            return _execute_plan_create_task(db, user, action)
        if isinstance(action, GoalsCreateGoalAction):
            return _execute_goals_create_goal(db, user, action)
        if isinstance(action, GoalsAddMilestoneAction):
            return _execute_goals_add_milestone(db, user, action)
        if isinstance(action, TrackCreateMetricAction):
            return _execute_track_create_metric(db, user, action)
        if isinstance(action, TrackLogMetricAction):
            return _execute_track_log_metric(db, user, action)
    except AppError as exc:
        return ChatActionExecuteResponse(
            status="failed",
            message=exc.detail,
            action=action,
        )
    except Exception:
        logger.exception("Failed to execute chat action type=%s", action.type)
        return ChatActionExecuteResponse(
            status="failed",
            message="Something went wrong while executing this action.",
            action=action,
        )

    return ChatActionExecuteResponse(
        status="failed",
        message=f"Unsupported action type: {action.type}",
        action=action,
    )
