"""Chat business logic — sessions, messages, and AI replies via agents."""

from __future__ import annotations

import datetime
import html
import json
import logging
import re
from uuid import uuid4

from pydantic import TypeAdapter, ValidationError

from sqlalchemy import func, select
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
from app.models.enums import (
    AgentType,
    AssistantActionConfidence,
    AssistantActionModule,
    ChatRole,
    GoalStatus,
)
from app.models.goal import Goal
from app.models.metric import TrackedMetric
from app.models.milestone import Milestone
from app.models.user import User
from app.schemas.activity import ActivityLogCreate
from app.schemas.chat import (
    AssistantProposedAction,
    ChatActionExecuteResponse,
    ChatSessionCreate,
    GoalsAddMilestoneArgs,
    GoalsAddMilestoneAction,
    GoalsCreateGoalArgs,
    GoalsCreateGoalAction,
    PlanCreateTaskAction,
    RepetitiveTasksCreateTaskAction,
    TrackCreateMetricAction,
    TrackLogMetricAction,
)
from app.schemas.goal import GoalCreate
from app.schemas.metric import MetricCreate
from app.schemas.milestone import MilestoneCreate
from app.schemas.plan import PlannedTaskCreate
from app.schemas.repetitive_task import RepetitiveTaskCreate
from app.services import (
    goal_service,
    metric_service,
    plan_service,
    repetitive_task_service,
    settings_service,
)
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
    "repetitive_tasks.create_task",
}
_GOAL_CONTEXT_MARKER = "[goal_context]"
_GOAL_DISCOVERY_SEED_PREFIX = "[goal_discovery_seed]"
_GOAL_DISCOVERY_EXTRACTION_PROMPT_MARKER = "GOAL_DISCOVERY_EXTRACTION_JSON_V1"
_ASSISTANT_STRUCTURED_REPLY_SCHEMA = "SHADOW_RESPONSE_JSON_V1"
_MAX_GOAL_BREAKDOWN_MILESTONES = 18
_MAX_GOAL_DISCOVERY_GOALS = 12
_MILESTONE_BULLET_PATTERN = r"(?:[-*•●◦▪▫◉○◌‣⁃∙·]|[oO])"
_ASSISTANT_JSON_CODE_BLOCK_PATTERN = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)

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


def _chat_response_format_hint(agent_type: AgentType) -> str:
    base_hint = (
        "Return two sections in this exact order:\n"
        "1) User-facing markdown response.\n"
        "2) A fenced JSON block (`json`) for machine parsing.\n"
        "JSON schema:\n"
        "{\n"
        f'  "schema": "{_ASSISTANT_STRUCTURED_REPLY_SCHEMA}",\n'
        '  "intent": "short intent label",\n'
        '  "goals": [{"title":"...","description":"...","category":"...","target_date":"YYYY-MM-DD"|null}],\n'
        '  "milestones": [{"title":"...","description":"...","due_date":"YYYY-MM-DD"|null,"order":1|null}],\n'
        '  "actions": [assistant action objects using app action schema]\n'
        "}\n"
        "Rules:\n"
        f"- `schema` must be `{_ASSISTANT_STRUCTURED_REPLY_SCHEMA}`.\n"
        "- Keep markdown and JSON semantically aligned.\n"
        "- If no goals/actions apply, use empty arrays.\n"
        "- Do not include prose outside markdown + one JSON block."
    )

    if agent_type == AgentType.goal_coach:
        base_hint += (
            "\n- For milestone breakdowns, populate `milestones` with concrete milestone rows"
            " and include due dates whenever available."
        )

    return base_hint


def _parse_json_dict(raw: str) -> dict | None:
    text = _strip_markdown_fence(raw).strip()
    if not text:
        return None

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(text[start : end + 1])
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                return None
    return None


def _extract_assistant_structured_payload(raw_reply: str) -> tuple[str, dict | None]:
    text = (raw_reply or "").strip()
    if not text:
        return "", None

    payload: dict | None = None
    block_span: tuple[int, int] | None = None

    matches = list(_ASSISTANT_JSON_CODE_BLOCK_PATTERN.finditer(text))
    for match in reversed(matches):
        candidate = _parse_json_dict(match.group(1))
        if candidate is None:
            continue

        schema = candidate.get("schema")
        if not isinstance(schema, str):
            continue
        if schema.strip() != _ASSISTANT_STRUCTURED_REPLY_SCHEMA:
            continue

        payload = candidate
        block_span = match.span()
        break

    if payload is None or block_span is None:
        return text, None

    before = text[: block_span[0]].rstrip()
    after = text[block_span[1] :].lstrip()
    visible_parts = [part for part in [before, after] if part]
    visible_markdown = "\n\n".join(visible_parts).strip()
    return visible_markdown or text, payload


def _parse_structured_reply_actions(payload: dict | None) -> list[AssistantProposedAction]:
    if payload is None:
        return []

    actions = payload.get("actions")
    if not isinstance(actions, list):
        return []

    return _parse_proposed_actions(json.dumps({"actions": actions}))


def _milestone_candidates_from_structured_payload(
    payload: dict | None,
) -> list[tuple[str, str | None, datetime.datetime | None]]:
    if payload is None:
        return []

    rows = payload.get("milestones")
    if not isinstance(rows, list):
        return []

    ranked: list[tuple[int, int, str, str | None, datetime.datetime | None]] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue

        title_raw = row.get("title")
        if not isinstance(title_raw, str):
            continue

        title = _clean_milestone_title(title_raw)
        if not title:
            continue

        description = None
        description_raw = row.get("description")
        if isinstance(description_raw, str):
            description = _normalise_milestone_description(description_raw)

        parsed_due_date = None
        due_date_raw = row.get("due_date")
        if isinstance(due_date_raw, str):
            parsed_due_date = _extract_datetime_from_text(due_date_raw)
        due_date = _normalise_milestone_due_date(parsed_due_date)

        order_rank = index
        order_raw = row.get("order")
        if isinstance(order_raw, int) and order_raw > 0:
            order_rank = order_raw - 1

        ranked.append((order_rank, index, title, description, due_date))

    ranked.sort(key=lambda item: (item[0], item[1]))

    deduped: list[tuple[str, str | None, datetime.datetime | None]] = []
    seen: set[str] = set()
    for _, _, title, description, due_date in ranked:
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append((title, description, due_date))
        if len(deduped) >= _MAX_GOAL_BREAKDOWN_MILESTONES:
            break

    return deduped


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
    if isinstance(action, RepetitiveTasksCreateTaskAction):
        return f"Add repetitive task: {action.args.name}"
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


def _is_goal_discovery_seed_message(content: str) -> bool:
    return content.strip().startswith(_GOAL_DISCOVERY_SEED_PREFIX)


def _build_fresh_intake_context(user: User) -> str:
    profile_lines = [
        "## Profile",
        f"- Name: {user.name}",
        f"- Timezone: {user.timezone}",
    ]

    intake_lines = [
        "## Fresh intake mode",
        "- Treat this as a brand-new goal discovery conversation.",
        "- Ask a neutral clarifying question about what the user wants to achieve and by when.",
        "- Do not mention prior goals, memories, or assumptions unless the user brings them up first.",
    ]
    return "\n".join(profile_lines + [""] + intake_lines)


def _session_has_goal_discovery_seed(history_rows: list[ChatMessage]) -> bool:
    return any(
        row.role == ChatRole.user and _is_goal_discovery_seed_message(row.content)
        for row in history_rows
    )


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


def _looks_like_milestone_breakdown_reply(reply: str) -> bool:
    if not reply.strip():
        return False

    lowered = reply.lower()
    if re.search(r"\bmilestone\s*[0-9]+\b", lowered):
        return True

    heading_count = 0
    for raw_line in reply.splitlines():
        if _match_milestone_heading(raw_line) is None:
            continue
        heading_count += 1
        if heading_count >= 2:
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


def _clean_milestone_title(raw_title: str) -> str:
    title = raw_title.strip()
    title = re.sub(rf"^(?:{_MILESTONE_BULLET_PATTERN}|\s)+", "", title)
    title = re.sub(r"^[0-9]+[\.)\-\s]+", "", title)
    title = re.sub(r"^milestone\s*[0-9]+\s*[:\-\)]\s*", "", title, flags=re.IGNORECASE)
    title = title.replace("**", "")
    title = title.strip("`*_:- ")
    title = " ".join(title.split())
    if not title:
        return ""
    return title[:255]


def _milestone_action_title(milestone_title: str) -> str:
    prefix = "Add milestone: "
    max_title_len = 120
    budget = max_title_len - len(prefix)
    if budget <= 0:
        return "Add milestone"

    title = milestone_title.strip()[:budget].rstrip()
    if not title:
        return "Add milestone"
    return f"{prefix}{title}"


def _normalise_milestone_description(raw_description: str | None) -> str | None:
    if not raw_description:
        return None

    cleaned_lines: list[str] = []
    seen: set[str] = set()
    for raw_line in raw_description.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(rf"^{_MILESTONE_BULLET_PATTERN}\s+", "", line, flags=re.IGNORECASE)
        line = line.replace("**", "")
        line = line.strip("`*_ ")
        line = " ".join(line.split())
        if not line:
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned_lines.append(line)

    if not cleaned_lines:
        return None
    return "\n".join(cleaned_lines)[:2000]


def _looks_like_html_fragment(value: str) -> bool:
    return re.search(r"</?[a-z][\s\S]*>", value, flags=re.IGNORECASE) is not None


def _to_formatted_milestone_description(raw_description: str | None) -> str | None:
    if not raw_description:
        return None

    trimmed = raw_description.strip()
    if not trimmed:
        return None
    if _looks_like_html_fragment(trimmed):
        return trimmed[:4000]

    normalized = _normalise_milestone_description(trimmed)
    if not normalized:
        return None

    html_items: list[str] = []
    for line in normalized.splitlines():
        key_value_match = re.match(r"^([A-Za-z][A-Za-z0-9 /().&%-]{1,40}):\s+(.+)$", line)
        if key_value_match is not None:
            label = html.escape(key_value_match.group(1).strip())
            value = html.escape(key_value_match.group(2).strip())
            html_items.append(f"<li><strong>{label}:</strong> {value}</li>")
            continue

        html_items.append(f"<li>{html.escape(line)}</li>")

    if not html_items:
        return None
    return "<ul>" + "".join(html_items) + "</ul>"


def _merge_milestone_descriptions(*parts: str | None) -> str | None:
    merged_lines: list[str] = []
    seen: set[str] = set()

    for part in parts:
        normalized = _normalise_milestone_description(part)
        if not normalized:
            continue
        for line in normalized.splitlines():
            key = line.lower()
            if key in seen:
                continue
            seen.add(key)
            merged_lines.append(line)

    if not merged_lines:
        return None
    return "\n".join(merged_lines)[:2000]


def _clean_milestone_detail_line(raw_line: str) -> str | None:
    line = raw_line.strip()
    if not line:
        return None
    if re.match(r"^(?:next action|your first step)\s*:", line, flags=re.IGNORECASE):
        return None

    # Bullet-like detail formats from model responses.
    bullet_match = re.match(rf"^{_MILESTONE_BULLET_PATTERN}\s+(.+)$", line, flags=re.IGNORECASE)
    if bullet_match is not None:
        line = bullet_match.group(1).strip()
    else:
        numbered_subitem = re.match(r"^(?:[A-Za-z][\.)]|[0-9]+[\.)])\s+(.+)$", line)
        if numbered_subitem is not None:
            line = numbered_subitem.group(1).strip()
        else:
            has_indent = len(raw_line) > len(raw_line.lstrip())
            looks_like_key_value = (
                re.match(r"^[A-Za-z][A-Za-z0-9 /().&%-]{1,40}:\s+.+$", line) is not None
            )
            if not has_indent and not looks_like_key_value:
                return None

    line = line.replace("**", "")
    line = line.strip("`*_ ")
    line = " ".join(line.split())
    if not line:
        return None
    return line[:400]


def _match_milestone_heading(raw_line: str) -> str | None:
    line = raw_line.rstrip()
    # Markdown heading variants such as "### Milestone 1: ...".
    line = re.sub(r"^\s{0,3}#{1,6}\s*", "", line)

    numbered_heading = re.match(r"^\s*[0-9]+\.\s+(.+)$", line)
    if numbered_heading is not None:
        return numbered_heading.group(1)

    bullet_milestone_heading = re.match(
        rf"^\s*{_MILESTONE_BULLET_PATTERN}\s*\**\s*milestone\s*[0-9]+\s*[:\-\)]\s*(.+)$",
        line,
        flags=re.IGNORECASE,
    )
    if bullet_milestone_heading is not None:
        return bullet_milestone_heading.group(1)

    plain_milestone_heading = re.match(
        r"^\s*\**\s*milestone\s*[0-9]+\s*[:\-\)]\s*(.+)$",
        line,
        flags=re.IGNORECASE,
    )
    if plain_milestone_heading is not None:
        return plain_milestone_heading.group(1)

    return None


def _extract_milestones_from_reply(reply: str) -> list[tuple[str, str | None]]:
    parsed: list[tuple[str, str | None]] = []
    current_title = ""
    current_details: list[str] = []

    def _flush_current() -> None:
        nonlocal current_title, current_details
        if not current_title:
            return

        description = _normalise_milestone_description("\n".join(current_details))
        parsed.append((current_title, description))
        current_title = ""
        current_details = []

    for raw_line in reply.splitlines():
        heading_title = _match_milestone_heading(raw_line)
        if heading_title is not None:
            _flush_current()
            current_title = _clean_milestone_title(heading_title)
            current_details = []
            continue

        if not current_title:
            continue

        detail = _clean_milestone_detail_line(raw_line)
        if detail is not None:
            current_details.append(detail)

    _flush_current()

    deduped: list[tuple[str, str | None]] = []
    seen_titles: set[str] = set()
    for title, description in parsed:
        if not title:
            continue
        key = title.lower()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        deduped.append((title, description))
        if len(deduped) >= _MAX_GOAL_BREAKDOWN_MILESTONES:
            break
    return deduped


def _next_goal_milestone_order(db: Session, goal_id: int) -> int:
    max_order = db.scalar(select(func.max(Milestone.order)).where(Milestone.goal_id == goal_id))
    if max_order is None:
        return 0
    return int(max_order) + 1


def _normalise_milestone_due_date(value: datetime.datetime | None) -> datetime.datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        normalized = value.replace(tzinfo=datetime.timezone.utc)
    else:
        normalized = value.astimezone(datetime.timezone.utc)

    if normalized.date() < datetime.date.today():
        return None
    return normalized


def _normalise_goal_target_date(value: datetime.datetime | None) -> datetime.datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)


def _extract_datetime_from_text(text: str) -> datetime.datetime | None:
    iso_match = re.search(r"\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b", text)
    if iso_match is not None:
        year, month, day = (int(part) for part in iso_match.groups())
        try:
            return datetime.datetime(year, month, day, tzinfo=datetime.timezone.utc)
        except ValueError:
            return None

    month_match = re.search(
        r"\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b",
        text,
    )
    if month_match is None:
        return None

    month_name, day_text, year_text = month_match.groups()
    token = f"{month_name} {int(day_text)} {year_text}"
    for fmt in ("%B %d %Y", "%b %d %Y"):
        try:
            parsed = datetime.datetime.strptime(token, fmt)
            return parsed.replace(tzinfo=datetime.timezone.utc)
        except ValueError:
            continue
    return None


def _strip_goal_discovery_line_prefix(raw_line: str) -> str:
    line = raw_line.strip()
    if not line:
        return ""
    line = re.sub(r"^\s{0,3}#{1,6}\s*", "", line)
    line = re.sub(rf"^(?:{_MILESTONE_BULLET_PATTERN}|[0-9]+[\.)])\s+", "", line)
    line = line.replace("**", "").replace("__", "")
    line = line.strip("` ")
    line = " ".join(line.split())
    return line


def _goal_heading_text(raw_line: str) -> str | None:
    line = _strip_goal_discovery_line_prefix(raw_line)
    if not line:
        return None
    match = re.match(
        r"^(?:(?:overall|main|primary|trackable|first)\s+)?goal(?:\s*[0-9]+)?\s*[:\-]\s*(.+)$",
        line,
        flags=re.IGNORECASE,
    )
    if match is not None:
        return match.group(1).strip()

    objective_match = re.match(
        r"^(?:(?:overall|main|primary)\s+)?objective\s*[:\-]\s*(.+)$",
        line,
        flags=re.IGNORECASE,
    )
    if objective_match is not None:
        return objective_match.group(1).strip()
    return None


def _clean_goal_candidate_title(raw_title: str) -> tuple[str, datetime.datetime | None]:
    title = raw_title.replace("**", "").strip()
    target_date = _extract_datetime_from_text(title)

    title = re.sub(
        r"\btarget\s*date\s*:\s*(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2})",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(
        r"\bby\s+(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+20\d{2})\b",
        "",
        title,
        flags=re.IGNORECASE,
    )

    title = re.sub(
        r"\((?:\s*(?:by|target(?:\s+date)?)\s*:?\s*)?[^)]*\)",
        "",
        title,
        flags=re.IGNORECASE,
    )
    title = re.sub(r"\s*[-:]+\s*$", "", title)
    title = " ".join(title.split())
    return title[:255], _normalise_goal_target_date(target_date)


def _coach_goal_category(category_hint: str | None, *, fallback: str = "Personal") -> str:
    if category_hint:
        category = " ".join(category_hint.split())
        if category:
            # Keep coach-provided categories verbatim (no taxonomy mapping).
            return category[:64]
    return fallback


def _build_goal_candidate_description(lines: list[str]) -> str | None:
    cleaned: list[str] = []
    for raw_line in lines:
        line = _strip_goal_discovery_line_prefix(raw_line)
        if not line:
            continue
        line = line.replace("**", "")
        line = " ".join(line.split())
        if not line:
            continue
        if re.match(r"^category\s*:", line, flags=re.IGNORECASE):
            continue
        if re.match(r"^target\s*date\s*:", line, flags=re.IGNORECASE):
            continue
        if re.match(r"^title\s*:", line, flags=re.IGNORECASE):
            continue
        cleaned.append(line)

    if not cleaned:
        return None
    return "\n".join(cleaned[:18])[:2000]


def _extract_goal_candidate_metadata(
    title: str,
    lines: list[str],
    heading_target_date: datetime.datetime | None,
) -> tuple[str | None, str, datetime.datetime | None]:
    category_hints: list[str] = []
    target_date_candidates: list[datetime.datetime] = []

    for raw_line in lines:
        line = _strip_goal_discovery_line_prefix(raw_line)
        if not line:
            continue

        category_match = re.search(r"\bcategory\s*:\s*(.+)$", line, flags=re.IGNORECASE)
        if category_match is not None:
            category_hints.append(category_match.group(1).strip())

        if "target date" in line.lower() or line.lower().startswith("by "):
            parsed_date = _extract_datetime_from_text(line)
            if parsed_date is not None:
                target_date_candidates.append(parsed_date)

    description = _build_goal_candidate_description(lines)
    category_hint = category_hints[0] if category_hints else None
    category = _coach_goal_category(category_hint)

    target_date = heading_target_date
    if target_date is None and target_date_candidates:
        target_date = max(target_date_candidates)

    return description, category, _normalise_goal_target_date(target_date)


def _extract_goal_discovery_heading_candidates(
    assistant_reply: str,
) -> list[tuple[str, str | None, str, datetime.datetime | None]]:
    candidates: list[tuple[str, str | None, str, datetime.datetime | None]] = []
    current_heading: str | None = None
    current_lines: list[str] = []

    def _flush() -> None:
        nonlocal current_heading, current_lines
        if current_heading is None:
            return

        title, heading_target_date = _clean_goal_candidate_title(current_heading)
        if not title:
            current_heading = None
            current_lines = []
            return

        description, category, target_date = _extract_goal_candidate_metadata(
            title,
            current_lines,
            heading_target_date,
        )
        candidates.append((title, description, category, target_date))
        current_heading = None
        current_lines = []

    for raw_line in assistant_reply.splitlines():
        heading = _goal_heading_text(raw_line)
        if heading is not None:
            _flush()
            current_heading = heading
            continue

        if current_heading is not None:
            current_lines.append(raw_line)

    _flush()
    return candidates


def _extract_goal_discovery_action_block_candidates(
    assistant_reply: str,
) -> list[tuple[str, str | None, str, datetime.datetime | None]]:
    candidates: list[tuple[str, str | None, str, datetime.datetime | None]] = []
    current_title: str | None = None
    current_description_lines: list[str] = []
    current_category_hint: str | None = None
    current_target_date: datetime.datetime | None = None

    def _flush() -> None:
        nonlocal current_title, current_description_lines, current_category_hint, current_target_date
        if current_title is None:
            return

        cleaned_title, fallback_target_date = _clean_goal_candidate_title(current_title)
        if not cleaned_title:
            current_title = None
            current_description_lines = []
            current_category_hint = None
            current_target_date = None
            return

        description = _build_goal_candidate_description(current_description_lines)
        category = _coach_goal_category(current_category_hint)
        target_date = _normalise_goal_target_date(current_target_date or fallback_target_date)
        candidates.append((cleaned_title, description, category, target_date))

        current_title = None
        current_description_lines = []
        current_category_hint = None
        current_target_date = None

    for raw_line in assistant_reply.splitlines():
        line = _strip_goal_discovery_line_prefix(raw_line)
        if not line:
            continue

        line = " ".join(line.split())

        title_match = re.match(r"^title\s*:\s*(.+)$", line, flags=re.IGNORECASE)
        action_match = re.match(r"^action\s*:\s*(.+)$", line, flags=re.IGNORECASE)
        if title_match is not None or action_match is not None:
            _flush()
            current_title = (title_match or action_match).group(1).strip()
            continue

        if current_title is None:
            continue

        description_match = re.match(r"^description\s*:\s*(.+)$", line, flags=re.IGNORECASE)
        if description_match is not None:
            current_description_lines.append(description_match.group(1).strip())
            continue

        category_match = re.match(r"^category\s*:\s*(.+)$", line, flags=re.IGNORECASE)
        if category_match is not None:
            current_category_hint = category_match.group(1).strip()
            continue

        target_match = re.match(r"^target\s*date\s*:\s*(.+)$", line, flags=re.IGNORECASE)
        if target_match is not None:
            parsed = _extract_datetime_from_text(target_match.group(1))
            if parsed is not None:
                current_target_date = parsed
            continue

        if current_description_lines:
            current_description_lines.append(line)

    _flush()
    return candidates


def _dedupe_goal_candidates(
    candidates: list[tuple[str, str | None, str, datetime.datetime | None]],
) -> list[tuple[str, str | None, str, datetime.datetime | None]]:
    deduped: list[tuple[str, str | None, str, datetime.datetime | None]] = []
    seen: set[str] = set()
    for title, description, category, target_date in candidates:
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append((title, description, category, target_date))
        if len(deduped) >= _MAX_GOAL_DISCOVERY_GOALS:
            break
    return deduped


def _looks_like_goal_discovery_plan_reply(assistant_reply: str) -> bool:
    normalized_lines = [
        _strip_goal_discovery_line_prefix(raw_line)
        for raw_line in assistant_reply.splitlines()
    ]
    lowered = "\n".join(line for line in normalized_lines if line).lower()
    goal_marker_count = len(
        re.findall(r"\b(?:goal(?:\s*[0-9]+)?|objective)\s*[:\-]", lowered)
    )
    action_marker_count = len(re.findall(r"\baction\s*:", lowered))
    title_marker_count = len(re.findall(r"\btitle\s*:", lowered))
    target_date_marker_count = len(re.findall(r"\btarget\s*date\s*:", lowered))

    if goal_marker_count >= 1:
        return True
    if action_marker_count >= 2 and target_date_marker_count >= 1:
        return True
    if title_marker_count >= 2 and target_date_marker_count >= 1:
        return True
    return False


def _is_goal_discovery_session(session: ChatSession) -> bool:
    return session.agent_type == AgentType.general and "goal discovery" in session.title.lower()


def _extract_goal_discovery_goal_candidates(
    assistant_reply: str,
) -> list[tuple[str, str | None, str, datetime.datetime | None]]:
    heading_candidates = _extract_goal_discovery_heading_candidates(assistant_reply)
    action_block_candidates = _extract_goal_discovery_action_block_candidates(assistant_reply)
    return _dedupe_goal_candidates([*heading_candidates, *action_block_candidates])


def _goal_candidates_from_structured_payload(
    payload: dict | None,
) -> list[tuple[str, str | None, str, datetime.datetime | None]]:
    if payload is None:
        return []

    goals = payload.get("goals")
    if not isinstance(goals, list):
        return []

    extracted: list[tuple[str, str | None, str, datetime.datetime | None]] = []
    for item in goals:
        if not isinstance(item, dict):
            continue

        title_raw = item.get("title")
        if not isinstance(title_raw, str):
            continue

        cleaned_title, fallback_target_date = _clean_goal_candidate_title(title_raw)
        if not cleaned_title:
            continue

        description_raw = item.get("description")
        description = None
        if isinstance(description_raw, str):
            description = _build_goal_candidate_description(description_raw.splitlines())

        category_raw = item.get("category") if isinstance(item.get("category"), str) else None
        category = _coach_goal_category(category_raw)

        target_date_raw = item.get("target_date")
        parsed_target_date = None
        if isinstance(target_date_raw, str):
            parsed_target_date = _extract_datetime_from_text(target_date_raw)
        target_date = _normalise_goal_target_date(parsed_target_date or fallback_target_date)

        extracted.append((cleaned_title, description, category, target_date))

    return _dedupe_goal_candidates(extracted)


def _extract_goal_discovery_goal_candidates_via_model(
    provider: LLMProvider,
    *,
    assistant_reply: str,
    model: str | None,
) -> list[tuple[str, str | None, str, datetime.datetime | None]]:
    prompt = (
        f"{_GOAL_DISCOVERY_EXTRACTION_PROMPT_MARKER}\n"
        "Extract goal candidates from the assistant plan below.\n"
        "IMPORTANT: Keep category text exactly as written by the coach.\n"
        "Return strict JSON only with this schema:\n"
        "{\"goals\":[{\"title\":\"...\",\"description\":\"...\",\"category\":\"...\",\"target_date\":\"YYYY-MM-DD\"|null}]}\n"
        "Do not return markdown or prose.\n\n"
        "Assistant plan:\n"
        f"{assistant_reply}"
    )

    try:
        raw = provider.generate(
            [LLMMessage("user", prompt)],
            temperature=0,
            max_tokens=900,
            model=model,
        ).strip()
    except Exception:
        return []

    payload = _parse_json_dict(raw)
    return _goal_candidates_from_structured_payload(payload)


def _goal_create_action_title(goal_title: str) -> str:
    prefix = "Save goal: "
    budget = 120 - len(prefix)
    if budget <= 0:
        return "Save goal"
    clipped = goal_title.strip()[:budget].rstrip()
    return f"{prefix}{clipped}" if clipped else "Save goal"


def _ensure_goal_discovery_goal_actions(
    *,
    assistant_reply: str,
    should_synthesize: bool,
    fallback_candidates: list[tuple[str, str | None, str, datetime.datetime | None]] | None,
    actions: list[AssistantProposedAction],
) -> list[AssistantProposedAction]:
    if not should_synthesize:
        return actions

    # Prefer structured candidates when available; parse markdown text only as fallback.
    extracted_goals = fallback_candidates or _extract_goal_discovery_goal_candidates(assistant_reply)
    if not extracted_goals:
        return actions

    normalized_actions: list[AssistantProposedAction] = []
    seen_goal_titles: set[str] = set()

    for action in actions:
        if not isinstance(action, GoalsCreateGoalAction):
            normalized_actions.append(action)
            continue

        cleaned_title, fallback_target_date = _clean_goal_candidate_title(action.args.title)
        if not cleaned_title:
            continue

        action.args.title = cleaned_title
        action.args.description = _build_goal_candidate_description(
            (action.args.description or "").splitlines()
        )
        action.args.category = _coach_goal_category(action.args.category)
        action.args.target_date = _normalise_goal_target_date(
            action.args.target_date or fallback_target_date
        )
        action.confidence = AssistantActionConfidence.high
        action.requires_confirmation = False
        action.destructive = False
        if not action.title.strip():
            action.title = _goal_create_action_title(cleaned_title)

        seen_goal_titles.add(cleaned_title.lower())
        normalized_actions.append(action)

    for title, description, category, target_date in extracted_goals:
        title_key = title.lower()
        if title_key in seen_goal_titles:
            continue

        normalized_actions.append(
            GoalsCreateGoalAction(
                id=f"act_{uuid4().hex[:10]}",
                module=AssistantActionModule.goals,
                type="goals.create_goal",
                title=_goal_create_action_title(title),
                rationale="Structured goal extracted from your discovery plan.",
                confidence=AssistantActionConfidence.high,
                requires_confirmation=False,
                destructive=False,
                args=GoalsCreateGoalArgs(
                    title=title,
                    description=description,
                    category=category,
                    target_date=target_date,
                ),
            )
        )
        seen_goal_titles.add(title_key)

    return normalized_actions


def _existing_goal_milestone_titles(db: Session, goal_id: int) -> set[str]:
    rows = list(db.scalars(select(Milestone.title).where(Milestone.goal_id == goal_id)))
    return {row.strip().lower() for row in rows if row and row.strip()}


def _ensure_goal_breakdown_milestone_actions(
    db: Session,
    *,
    user_content: str,
    assistant_reply: str,
    focus_goal: Goal | None,
    fallback_candidates: list[tuple[str, str | None, datetime.datetime | None]] | None,
    actions: list[AssistantProposedAction],
) -> list[AssistantProposedAction]:
    if focus_goal is None:
        return actions

    wants_breakdown = _is_goal_breakdown_request(user_content)
    reply_looks_like_breakdown = _looks_like_milestone_breakdown_reply(assistant_reply)
    if not wants_breakdown and not reply_looks_like_breakdown:
        return actions

    has_structured_milestone_actions = any(
        isinstance(action, GoalsAddMilestoneAction) for action in actions
    )

    extracted_milestones: list[tuple[str, str | None, datetime.datetime | None]] = []
    extracted_description_by_title: dict[str, str] = {}
    extracted_due_date_by_title: dict[str, datetime.datetime] = {}

    if fallback_candidates:
        extracted_milestones = fallback_candidates
    elif not has_structured_milestone_actions:
        extracted_milestones = [
            (title, description, None)
            for title, description in _extract_milestones_from_reply(assistant_reply)
        ]

    for title, description, due_date in extracted_milestones:
        key = title.lower()
        if description is not None and key not in extracted_description_by_title:
            extracted_description_by_title[key] = description
        if due_date is not None and key not in extracted_due_date_by_title:
            extracted_due_date_by_title[key] = due_date

    existing_titles = _existing_goal_milestone_titles(db, focus_goal.id)
    seen_titles = set(existing_titles)
    next_order = _next_goal_milestone_order(db, focus_goal.id)

    normalized_actions: list[AssistantProposedAction] = []
    milestone_action_count = 0

    for action in actions:
        if not isinstance(action, GoalsAddMilestoneAction):
            normalized_actions.append(action)
            continue

        cleaned_title = _clean_milestone_title(action.args.title)
        if not cleaned_title:
            continue
        title_key = cleaned_title.lower()
        if title_key in seen_titles:
            continue

        action.args.goal_id = focus_goal.id
        action.args.title = cleaned_title
        action.args.details = None
        action.args.due_date = _normalise_milestone_due_date(action.args.due_date)
        if action.args.due_date is None:
            action.args.due_date = extracted_due_date_by_title.get(title_key)
        action.args.description = _normalise_milestone_description(action.args.description)

        detail_from_reply = extracted_description_by_title.get(title_key)
        action.args.description = _to_formatted_milestone_description(
            _merge_milestone_descriptions(action.args.description, detail_from_reply)
        )

        if action.args.order <= 0:
            action.args.order = next_order
            next_order += 1
        action.confidence = AssistantActionConfidence.high
        action.requires_confirmation = False
        action.destructive = False
        if not action.title.strip():
            action.title = _milestone_action_title(cleaned_title)

        seen_titles.add(title_key)
        milestone_action_count += 1
        normalized_actions.append(action)

    if milestone_action_count > 0:
        return normalized_actions

    for title, description, due_date in extracted_milestones:
        title_key = title.lower()
        if title_key in seen_titles:
            continue

        normalized_actions.append(
            GoalsAddMilestoneAction(
                id=f"act_{uuid4().hex[:10]}",
                module=AssistantActionModule.goals,
                type="goals.add_milestone",
                title=_milestone_action_title(title),
                confidence=AssistantActionConfidence.high,
                requires_confirmation=False,
                destructive=False,
                args=GoalsAddMilestoneArgs(
                    goal_id=focus_goal.id,
                    title=title,
                    description=_to_formatted_milestone_description(description),
                    details=None,
                    order=next_order,
                    due_date=due_date,
                ),
            )
        )
        next_order += 1
        seen_titles.add(title_key)

    return normalized_actions


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
    normalized_due_date = _normalise_milestone_due_date(action.args.due_date)
    milestone = goal_service.add_milestone(
        db,
        user,
        action.args.goal_id,
        MilestoneCreate(
            title=action.args.title,
            description=action.args.description,
            details=action.args.details,
            order=action.args.order,
            due_date=normalized_due_date,
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


def _execute_repetitive_tasks_create_task(
    db: Session,
    user: User,
    action: RepetitiveTasksCreateTaskAction,
) -> ChatActionExecuteResponse:
    task = repetitive_task_service.create_task(
        db,
        user,
        RepetitiveTaskCreate(**action.args.model_dump()),
    )
    return ChatActionExecuteResponse(
        status="executed",
        message=f"Repetitive task '{task.name}' was created.",
        action=action,
        link="/repetitive-tasks",
        entity_id=task.id,
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
    *,
    fresh_intake_mode: bool = False,
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
    session_in_goal_discovery_mode = _session_has_goal_discovery_seed(history_rows)
    use_fresh_intake_context = fresh_intake_mode or session_in_goal_discovery_mode
    if use_fresh_intake_context:
        base_context = _build_fresh_intake_context(user)
        focus_goal = None
    else:
        base_context = compile_user_context(db, user)
    user_context = _with_goal_focus_context(base_context, focus_goal)

    used_model_reply = disambiguation_reply is None
    structured_reply_payload: dict | None = None

    if disambiguation_reply is None:
        raw_reply = generate_chat_reply(
            provider,
            agent_type=session.agent_type,
            history=history,
            user_context=user_context,
            response_format_hint=_chat_response_format_hint(session.agent_type),
            model=preferred_model,
        )
        reply, structured_reply_payload = _extract_assistant_structured_payload(raw_reply)
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
        proposed_actions = _parse_structured_reply_actions(structured_reply_payload)
        if structured_reply_payload is None:
            raw_actions = ""
            try:
                raw_actions = propose_chat_actions(
                    provider,
                    agent_type=session.agent_type,
                    history=reply_history,
                    user_context=user_context,
                    model=preferred_model,
                )
            except Exception:
                logger.warning("Failed to generate proposed actions for session_id=%s", session.id)

            if raw_actions:
                proposed_actions = _parse_proposed_actions(raw_actions)

        try:
            structured_milestone_candidates = _milestone_candidates_from_structured_payload(
                structured_reply_payload
            )
            proposed_actions = _ensure_goal_breakdown_milestone_actions(
                db,
                user_content=user_content,
                assistant_reply=reply,
                focus_goal=focus_goal,
                fallback_candidates=(
                    structured_milestone_candidates if structured_milestone_candidates else None
                ),
                actions=proposed_actions,
            )
        except Exception:
            logger.warning(
                "Failed to synthesize goal milestone actions for session_id=%s",
                session.id,
            )

        try:
            should_synthesize_goal_discovery_actions = (
                session_in_goal_discovery_mode
                or _is_goal_discovery_session(session)
                or _looks_like_goal_discovery_plan_reply(reply)
            )
            structured_goal_candidates = _goal_candidates_from_structured_payload(
                structured_reply_payload
            )
            proposed_actions = _ensure_goal_discovery_goal_actions(
                assistant_reply=reply,
                should_synthesize=should_synthesize_goal_discovery_actions,
                fallback_candidates=(
                    structured_goal_candidates if structured_goal_candidates else None
                ),
                actions=proposed_actions,
            )

            has_goal_create_action = any(
                isinstance(action, GoalsCreateGoalAction) for action in proposed_actions
            )
            if should_synthesize_goal_discovery_actions and not has_goal_create_action:
                fallback_candidates = _extract_goal_discovery_goal_candidates_via_model(
                    provider,
                    assistant_reply=reply,
                    model=preferred_model,
                )
                if fallback_candidates:
                    proposed_actions = _ensure_goal_discovery_goal_actions(
                        assistant_reply=reply,
                        should_synthesize=True,
                        fallback_candidates=fallback_candidates,
                        actions=proposed_actions,
                    )
        except Exception:
            logger.warning(
                "Failed to synthesize goal discovery actions for session_id=%s",
                session.id,
            )

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
        if isinstance(action, RepetitiveTasksCreateTaskAction):
            return _execute_repetitive_tasks_create_task(db, user, action)
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
