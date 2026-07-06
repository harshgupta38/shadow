"""Planned-task business logic (daily/weekly plan → planned-vs-done)."""

from __future__ import annotations

import json
import re
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import (
    estimate_today_task_durations_json,
    generate_today_plan_json,
    repair_today_plan_json,
    repair_today_task_durations_json,
)
from app.llm.base import LLMProvider
from app.memory.context import compile_user_context
from app.models.base import utcnow
from app.models.enums import (
    GoalStatus,
    NotificationType,
    PlannedTaskPriority,
    PlannedTaskSource,
    PlannedTaskStatus,
    RepetitiveTaskStatus,
)
from app.models.goal import Goal
from app.models.notification import Notification
from app.models.planned_task import PlannedTask
from app.models.repetitive_task import RepetitiveTask
from app.models.user import User
from app.schemas.plan import (
    PlanExecutionItem,
    PlanHabitStreakItem,
    PlanGeneratedTaskInput,
    PlanGenerationPayload,
    PlanInsightsRead,
    PlanWorkspaceRead,
    PlanWorkspaceTaskRead,
    PlannedTaskCreate,
    PlannedTaskUpdate,
)
from app.services import settings_service
from app.services.exceptions import AppError
from app.services.utils import get_owned_or_404

_MAX_GENERATED_TASKS = 8
_MAX_CARRY_FORWARD = 4
_MAX_TITLE_LENGTH = 255
_HISTORY_LOOKBACK_DAYS = 45
_MAX_ACCOUNTABILITY_LENGTH = 255
_MIN_ACCOUNTABILITY_COPY_LENGTH = 24
_PRIORITY_SORT = {
    PlannedTaskPriority.critical: 0,
    PlannedTaskPriority.high: 1,
    PlannedTaskPriority.medium: 2,
    PlannedTaskPriority.low: 3,
}
_CONFIDENCE_FALLBACK_BY_PRIORITY = {
    PlannedTaskPriority.critical: 92,
    PlannedTaskPriority.high: 86,
    PlannedTaskPriority.medium: 78,
    PlannedTaskPriority.low: 70,
}
_GENERIC_IMPACT_COPY = {
    "skipping this weakens your routine consistency and lowers momentum for today",
    "skipping this can reduce momentum and delay today's progress",
    "skipping this again can compound pending work and increase stress tomorrow",
    "delaying this reduces progress on an active goal and risks deadline pressure",
    "skipping this can break routine continuity",
}
_TIME_TOKEN_PATTERN = r"(?:\d{1,2}(?::?\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})"
_TIME_RANGE_RE = re.compile(
    rf"(?P<start>{_TIME_TOKEN_PATTERN})\s*(?:to|-)\s*(?P<end>{_TIME_TOKEN_PATTERN})",
    re.IGNORECASE,
)
_DURATION_HOUR_MIN_RE = re.compile(
    r"(?P<hours>\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?P<minutes>\d{1,2})\s*(?:m|min|mins|minute|minutes)\b",
    re.IGNORECASE,
)
_DURATION_HOUR_RE = re.compile(
    r"(?P<hours>\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b",
    re.IGNORECASE,
)
_DURATION_MIN_RE = re.compile(
    r"(?P<minutes>\d{1,3})\s*(?:m|min|mins|minute|minutes)\b",
    re.IGNORECASE,
)


def _safe_timezone(name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _to_utc_for_user(day: date, hhmm: str, timezone_name: str) -> datetime:
    hour, minute = hhmm.split(":", 1)
    local_dt = datetime.combine(
        day,
        time(hour=int(hour), minute=int(minute)),
        tzinfo=_safe_timezone(timezone_name),
    )
    return local_dt.astimezone(timezone.utc)


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
        return "\n".join(lines[1:-1]).strip()
    return text


def _hhmm_to_minutes(value: str | None) -> int | None:
    if not value:
        return None
    try:
        hour, minute = value.split(":", 1)
        hh = int(hour)
        mm = int(minute)
    except (TypeError, ValueError):
        return None
    if hh < 0 or hh > 23 or mm < 0 or mm > 59:
        return None
    return hh * 60 + mm


def _minutes_to_hhmm(value: int) -> str:
    minutes = value % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _parse_time_token(token: str) -> str | None:
    compact = re.sub(r"\s+", "", token.strip().lower())
    if not compact:
        return None

    if compact.endswith("am") or compact.endswith("pm"):
        suffix = compact[-2:]
        body = compact[:-2]
        if not body:
            return None

        if ":" in body:
            hour_text, minute_text = body.split(":", 1)
        elif len(body) <= 2:
            hour_text, minute_text = body, "00"
        elif len(body) in {3, 4}:
            hour_text, minute_text = body[:-2], body[-2:]
        else:
            return None

        try:
            hour = int(hour_text)
            minute = int(minute_text)
        except ValueError:
            return None
        if hour < 1 or hour > 12 or minute < 0 or minute > 59:
            return None

        hour %= 12
        if suffix == "pm":
            hour += 12
        return f"{hour:02d}:{minute:02d}"

    if ":" in compact:
        hour_text, minute_text = compact.split(":", 1)
        try:
            hour = int(hour_text)
            minute = int(minute_text)
        except ValueError:
            return None
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            return None
        return f"{hour:02d}:{minute:02d}"

    return None


def _extract_time_window(description: str | None) -> tuple[str | None, str | None]:
    if not description:
        return (None, None)
    match = _TIME_RANGE_RE.search(description)
    if match is None:
        return (None, None)

    start = _parse_time_token(match.group("start"))
    end = _parse_time_token(match.group("end"))
    if start is None or end is None:
        return (None, None)
    return (start, end)


def _normalize_duration_hint_minutes(value: int) -> int | None:
    if value < 5:
        return None
    return min(value, 360)


def _extract_duration_hint_minutes(description: str | None) -> int | None:
    if not description:
        return None

    text = description.lower()

    combined_match = _DURATION_HOUR_MIN_RE.search(text)
    if combined_match is not None:
        try:
            hours = float(combined_match.group("hours"))
            minutes = int(combined_match.group("minutes"))
        except (TypeError, ValueError):
            return None
        if minutes < 0 or minutes > 59:
            return None
        total_minutes = int(round(hours * 60)) + minutes
        return _normalize_duration_hint_minutes(total_minutes)

    candidates: list[tuple[int, int]] = []

    hour_match = _DURATION_HOUR_RE.search(text)
    if hour_match is not None:
        try:
            hours = float(hour_match.group("hours"))
        except (TypeError, ValueError):
            hours = 0
        total_minutes = int(round(hours * 60))
        normalized = _normalize_duration_hint_minutes(total_minutes)
        if normalized is not None:
            candidates.append((hour_match.start(), normalized))

    minute_match = _DURATION_MIN_RE.search(text)
    if minute_match is not None:
        try:
            minutes = int(minute_match.group("minutes"))
        except (TypeError, ValueError):
            minutes = 0
        normalized = _normalize_duration_hint_minutes(minutes)
        if normalized is not None:
            candidates.append((minute_match.start(), normalized))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def _normalize_title(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _impact_key(value: str) -> str:
    return _normalize_title(value.strip().rstrip(".!?"))


def _priority_sort_key(priority: PlannedTaskPriority) -> int:
    return _PRIORITY_SORT.get(priority, _PRIORITY_SORT[PlannedTaskPriority.medium])


def _priority_from_repetitive(priority_value: str) -> PlannedTaskPriority:
    try:
        return PlannedTaskPriority(priority_value)
    except ValueError:
        return PlannedTaskPriority.medium


def _pick_goal_id_from_repetitive(
    task: RepetitiveTask,
    active_goal_ids: set[int],
) -> int | None:
    linked_goal_ids = sorted({int(link.goal_id) for link in task.goal_links})
    if not linked_goal_ids:
        return None

    for goal_id in linked_goal_ids:
        if goal_id in active_goal_ids:
            return goal_id
    return linked_goal_ids[0]


def _infer_goal_id_from_repetitive_title(
    title: str,
    due_repetitive: list[RepetitiveTask],
    active_goal_ids: set[int],
) -> int | None:
    title_key = _normalize_title(title)
    if not title_key:
        return None

    for row in due_repetitive:
        repetitive_title_key = _normalize_title(row.name)
        if not repetitive_title_key:
            continue

        if _title_keys_match(title_key, repetitive_title_key):
            return _pick_goal_id_from_repetitive(row, active_goal_ids)

    return None


def _frequency_matches_day(frequency: str, on_date: date) -> bool:
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


def _validate_related_goal_id(db: Session, user: User, goal_id: int | None) -> int | None:
    if goal_id is None:
        return None
    goal = db.scalar(select(Goal.id).where(Goal.id == goal_id, Goal.user_id == user.id))
    if goal is None:
        raise AppError("Goal not found.")
    return goal_id


def _parse_generation_payload(raw: str) -> PlanGenerationPayload | None:
    text = _strip_markdown_fence(raw)
    if not text:
        return None

    payload: dict | None = None
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            payload = parsed
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(text[start : end + 1])
                if isinstance(parsed, dict):
                    payload = parsed
            except json.JSONDecodeError:
                payload = None

    if payload is None:
        return None

    try:
        return PlanGenerationPayload.model_validate(payload)
    except ValidationError:
        return None


class _DurationEstimateItem(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    estimated_duration_minutes: int | None = Field(default=None, ge=5, le=360)


class _DurationEstimatePayload(BaseModel):
    durations: list[_DurationEstimateItem] = Field(default_factory=list, max_length=32)


def _parse_duration_estimate_payload(raw: str) -> _DurationEstimatePayload | None:
    text = _strip_markdown_fence(raw)
    if not text:
        return None

    payload: dict | None = None
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            payload = parsed
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(text[start : end + 1])
                if isinstance(parsed, dict):
                    payload = parsed
            except json.JSONDecodeError:
                payload = None

    if payload is None:
        return None

    try:
        return _DurationEstimatePayload.model_validate(payload)
    except ValidationError:
        return None


def _clean_optional_text(value: str | None, *, max_length: int = 2000) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    if not cleaned:
        return None
    return cleaned[:max_length]


def _normalize_confidence_score(value: int | None) -> int | None:
    if value is None:
        return None
    return max(0, min(100, int(value)))


def _normalize_sentence_copy(value: str | None, *, max_length: int) -> str | None:
    cleaned = _clean_optional_text(value, max_length=max_length)
    if cleaned is None:
        return None
    cleaned = cleaned.strip(" \"'")
    if not cleaned:
        return None
    if cleaned[-1] not in ".!?":
        cleaned = f"{cleaned}."
    return cleaned[:max_length]


def _default_impact_if_skipped(
    *,
    task_title: str,
    priority: PlannedTaskPriority,
    carried_from_date: date | None,
    goal_title: str | None,
    is_habit: bool,
) -> str:
    task_label = _clean_optional_text(task_title, max_length=80) or "this task"
    goal_label = _clean_optional_text(goal_title, max_length=80) if goal_title else None

    if carried_from_date is not None:
        if goal_label:
            return (
                f"Skipping {task_label} again can slow your {goal_label} goal and "
                "compound unfinished work for tomorrow."
            )
        return (
            f"Skipping {task_label} again can compound unfinished work and reduce room "
            "for priorities tomorrow."
        )

    if goal_label and is_habit:
        return (
            f"Skipping {task_label} weakens consistency toward your {goal_label} goal "
            "and makes momentum harder to rebuild."
        )

    if goal_label and priority == PlannedTaskPriority.critical:
        return (
            f"Skipping {task_label} can directly delay your {goal_label} goal and "
            "create same-day deadline pressure."
        )

    if goal_label and priority == PlannedTaskPriority.high:
        return (
            f"Skipping {task_label} can slow measurable progress on {goal_label} and "
            "force catch-up later today."
        )

    if goal_label and priority == PlannedTaskPriority.medium:
        return (
            f"Skipping {task_label} can stall steady progress on {goal_label} and "
            "reduce weekly follow-through."
        )

    if goal_label and priority == PlannedTaskPriority.low:
        return f"Skipping {task_label} can add backlog that drifts your {goal_label} goal off track."

    if is_habit:
        return (
            f"Skipping {task_label} breaks routine consistency today and makes the habit "
            "harder to sustain this week."
        )

    if priority == PlannedTaskPriority.critical:
        return f"Skipping {task_label} can block other high-priority commitments and create same-day pressure."
    if priority == PlannedTaskPriority.high:
        return f"Skipping {task_label} can shrink your momentum and push key work into a tighter window."
    if priority == PlannedTaskPriority.medium:
        return f"Skipping {task_label} can weaken consistency and make your weekly plan harder to maintain."
    return f"Skipping {task_label} can add avoidable backlog and make tomorrow's start harder."


def _is_weak_impact_copy(value: str) -> bool:
    normalized = _impact_key(value)
    if len(normalized) < _MIN_ACCOUNTABILITY_COPY_LENGTH:
        return True
    if normalized in {"na", "n/a", "none", "null", "tbd", "unknown"}:
        return True
    if normalized in _GENERIC_IMPACT_COPY:
        return True
    return "..." in value


def _normalize_generated_accountability(
    candidate: _GeneratedCandidate,
    *,
    goal_title: str | None,
    is_habit: bool,
) -> tuple[str | None, str, int]:
    rationale = _normalize_sentence_copy(candidate.task.ai_rationale, max_length=2000)

    fallback_impact = _default_impact_if_skipped(
        task_title=candidate.task.title,
        priority=candidate.task.priority,
        carried_from_date=candidate.carried_from_date,
        goal_title=goal_title,
        is_habit=is_habit,
    )
    impact = _normalize_sentence_copy(
        candidate.task.ai_impact_if_skipped,
        max_length=_MAX_ACCOUNTABILITY_LENGTH,
    )
    if impact is None or _is_weak_impact_copy(impact):
        impact = fallback_impact

    if rationale and _normalize_title(rationale) == _normalize_title(impact):
        impact = fallback_impact

    confidence = _normalize_confidence_score(candidate.task.ai_confidence_score)
    if confidence is None:
        confidence = _CONFIDENCE_FALLBACK_BY_PRIORITY[candidate.task.priority]

    return rationale, impact, confidence


def _title_keys_match(left: str, right: str) -> bool:
    if not left or not right:
        return False
    return left == right or left in right or right in left


def _list_active_repetitive_tasks(db: Session, user: User) -> list[RepetitiveTask]:
    return list(
        db.scalars(
            select(RepetitiveTask)
            .where(
                RepetitiveTask.user_id == user.id,
                RepetitiveTask.status == RepetitiveTaskStatus.active,
            )
            .order_by(RepetitiveTask.updated_at.desc(), RepetitiveTask.id.desc())
        )
    )


def _is_repetitive_title(title: str, repetitive_tasks: list[RepetitiveTask]) -> bool:
    title_key = _normalize_title(title)
    if not title_key:
        return False

    for row in repetitive_tasks:
        repetitive_key = _normalize_title(row.name)
        if _title_keys_match(title_key, repetitive_key):
            return True
    return False


def _list_task_history_window(
    db: Session,
    user: User,
    *,
    on_date: date,
    lookback_days: int = _HISTORY_LOOKBACK_DAYS,
) -> list[PlannedTask]:
    start_date = on_date - timedelta(days=lookback_days)
    return list(
        db.scalars(
            select(PlannedTask)
            .where(
                PlannedTask.user_id == user.id,
                PlannedTask.date >= start_date,
                PlannedTask.date <= on_date,
            )
            .order_by(PlannedTask.date.desc(), PlannedTask.id.desc())
        )
    )


def _group_history_by_title(tasks: list[PlannedTask]) -> dict[str, list[PlannedTask]]:
    grouped: dict[str, list[PlannedTask]] = {}
    for task in tasks:
        title_key = _normalize_title(task.title)
        if not title_key:
            continue
        grouped.setdefault(title_key, []).append(task)
    return grouped


def _build_status_by_date(tasks: list[PlannedTask]) -> dict[date, PlannedTaskStatus]:
    status_by_date: dict[date, PlannedTaskStatus] = {}
    for task in tasks:
        existing = status_by_date.get(task.date)
        if existing == PlannedTaskStatus.done:
            continue
        if task.status == PlannedTaskStatus.done or existing is None:
            status_by_date[task.date] = task.status
    return status_by_date


@dataclass(frozen=True)
class _HabitStats:
    highest_streak_days: int
    current_streak_days: int
    completion_rate_percent: int
    last_completed_days_ago: int | None
    at_risk: bool


def _habit_stats_for_repetitive(
    repetitive: RepetitiveTask,
    history_rows: list[PlannedTask],
    *,
    on_date: date,
) -> _HabitStats:
    status_by_date = _build_status_by_date(history_rows)

    due_days: list[date] = []
    window_start = on_date - timedelta(days=13)
    cursor = window_start
    while cursor <= on_date:
        if any(_frequency_matches_day(freq, cursor) for freq in repetitive.frequencies):
            due_days.append(cursor)
        cursor += timedelta(days=1)

    completed_count = sum(
        1
        for due_day in due_days
        if status_by_date.get(due_day) == PlannedTaskStatus.done
    )
    completion_rate = (
        round((completed_count / len(due_days)) * 100)
        if due_days
        else 0
    )

    completed_dates = sorted(
        day
        for day, status in status_by_date.items()
        if status == PlannedTaskStatus.done and day <= on_date
    )
    last_completed_days_ago = (
        (on_date - completed_dates[-1]).days
        if completed_dates
        else None
    )

    highest_streak = 0
    active_streak = 0
    cursor = on_date - timedelta(days=_HISTORY_LOOKBACK_DAYS)
    inspected_due = 0
    while cursor <= on_date and inspected_due < _HISTORY_LOOKBACK_DAYS:
        if any(_frequency_matches_day(freq, cursor) for freq in repetitive.frequencies):
            inspected_due += 1
            if status_by_date.get(cursor) == PlannedTaskStatus.done:
                active_streak += 1
                if active_streak > highest_streak:
                    highest_streak = active_streak
            else:
                active_streak = 0
        cursor += timedelta(days=1)

    include_today = status_by_date.get(on_date) == PlannedTaskStatus.done
    cursor = on_date if include_today else on_date - timedelta(days=1)
    streak = 0
    inspected_due = 0
    floor = on_date - timedelta(days=_HISTORY_LOOKBACK_DAYS)
    while cursor >= floor and inspected_due < _HISTORY_LOOKBACK_DAYS:
        if any(_frequency_matches_day(freq, cursor) for freq in repetitive.frequencies):
            inspected_due += 1
            if status_by_date.get(cursor) == PlannedTaskStatus.done:
                streak += 1
            else:
                break
        cursor -= timedelta(days=1)

    due_today = any(_frequency_matches_day(freq, on_date) for freq in repetitive.frequencies)
    at_risk = due_today and status_by_date.get(on_date) != PlannedTaskStatus.done and streak > 0

    return _HabitStats(
        highest_streak_days=highest_streak,
        current_streak_days=streak,
        completion_rate_percent=completion_rate,
        last_completed_days_ago=last_completed_days_ago,
        at_risk=at_risk,
    )


def _build_habit_summary(
    due_repetitive: list[RepetitiveTask],
    history_by_title: dict[str, list[PlannedTask]],
    *,
    on_date: date,
) -> list[PlanHabitStreakItem]:
    rows: list[PlanHabitStreakItem] = []
    for repetitive in due_repetitive:
        title_key = _normalize_title(repetitive.name)
        if not title_key:
            continue

        stats = _habit_stats_for_repetitive(
            repetitive,
            history_by_title.get(title_key, []),
            on_date=on_date,
        )
        rows.append(
            PlanHabitStreakItem(
                task_title=repetitive.name,
                highest_streak_days=stats.highest_streak_days,
                current_streak_days=stats.current_streak_days,
                completion_rate_percent=stats.completion_rate_percent,
                last_completed_days_ago=stats.last_completed_days_ago,
                at_risk=stats.at_risk,
            )
        )

    rows.sort(
        key=lambda row: (
            0 if row.at_risk else 1,
            row.completion_rate_percent,
            row.current_streak_days,
            row.task_title.lower(),
        )
    )
    return rows


def _previous_completion_history(
    history_rows: list[PlannedTask],
    *,
    on_date: date,
    repetitive: RepetitiveTask | None = None,
) -> str | None:
    if repetitive is not None:
        stats = _habit_stats_for_repetitive(
            repetitive,
            history_rows,
            on_date=on_date,
        )
        if stats.last_completed_days_ago is None and stats.completion_rate_percent == 0:
            return "No recent completions recorded."
        message = f"{stats.completion_rate_percent}% completion in recent due sessions."
        if stats.last_completed_days_ago is not None:
            if stats.last_completed_days_ago == 0:
                message += " Completed today."
            else:
                message += f" Last done {stats.last_completed_days_ago}d ago."
        return message[:255]

    previous_rows = [row for row in history_rows if row.date < on_date]
    if not previous_rows:
        return None

    status_by_date = _build_status_by_date(previous_rows)
    recent_days = sorted(status_by_date.keys(), reverse=True)[:7]
    if not recent_days:
        return None

    completed_count = sum(
        1
        for day in recent_days
        if status_by_date.get(day) == PlannedTaskStatus.done
    )
    last_completed = max(
        (
            day
            for day, status in status_by_date.items()
            if status == PlannedTaskStatus.done
        ),
        default=None,
    )

    message = f"Completed {completed_count}/{len(recent_days)} previous occurrences."
    if last_completed is not None:
        days_ago = (on_date - last_completed).days
        if days_ago == 0:
            message += " Completed today."
        else:
            message += f" Last done {days_ago}d ago."
    return message[:255]


def _completed_late(task: PlannedTask, *, timezone_name: str) -> bool:
    if task.status != PlannedTaskStatus.done or task.completed_at is None:
        return False

    completed_local = task.completed_at.astimezone(_safe_timezone(timezone_name))
    if completed_local.date() > task.date:
        return True

    cutoff = task.suggested_finish_by_time or task.reminder_time
    cutoff_minutes = _hhmm_to_minutes(cutoff)
    if cutoff_minutes is None:
        return False

    completed_minutes = completed_local.hour * 60 + completed_local.minute
    return completed_local.date() == task.date and completed_minutes > cutoff_minutes


def _match_repetitive_task_by_title(
    title: str,
    repetitive_tasks: list[RepetitiveTask],
) -> RepetitiveTask | None:
    title_key = _normalize_title(title)
    if not title_key:
        return None

    for repetitive in repetitive_tasks:
        repetitive_key = _normalize_title(repetitive.name)
        if _title_keys_match(title_key, repetitive_key):
            return repetitive
    return None


def _infer_task_category(
    task: PlannedTask,
    *,
    goal: Goal | None,
    repetitive: RepetitiveTask | None,
) -> str:
    if repetitive is not None:
        return "Habit"
    if goal is not None and goal.category:
        return goal.category
    if goal is not None:
        return "Goal"
    if task.source == PlannedTaskSource.manual:
        return "Manual"
    if task.source == PlannedTaskSource.assistant:
        return "Assistant"
    return "AI"


def _build_workspace_task_rows(
    *,
    tasks: list[PlannedTask],
    goals_by_id: dict[int, Goal],
    repetitive_tasks: list[RepetitiveTask],
    history_by_title: dict[str, list[PlannedTask]],
    missed_yesterday_title_keys: set[str],
    on_date: date,
    timezone_name: str,
) -> list[PlanWorkspaceTaskRead]:
    repetitive_stats_cache: dict[int, _HabitStats] = {}
    rows: list[PlanWorkspaceTaskRead] = []

    for task in tasks:
        base = PlanWorkspaceTaskRead.model_validate(task)
        title_key = _normalize_title(task.title)
        goal = goals_by_id.get(task.related_goal_id) if task.related_goal_id is not None else None
        repetitive = _match_repetitive_task_by_title(task.title, repetitive_tasks)

        habit_stats: _HabitStats | None = None
        if repetitive is not None:
            habit_stats = repetitive_stats_cache.get(repetitive.id)
            if habit_stats is None:
                repetitive_key = _normalize_title(repetitive.name)
                habit_stats = _habit_stats_for_repetitive(
                    repetitive,
                    history_by_title.get(repetitive_key, []),
                    on_date=on_date,
                )
                repetitive_stats_cache[repetitive.id] = habit_stats

        previous_history = _previous_completion_history(
            history_by_title.get(title_key, []),
            on_date=on_date,
            repetitive=repetitive,
        )

        overdue = False
        if task.status != PlannedTaskStatus.done:
            if task.carried_from_date is not None and task.carried_from_date < on_date:
                overdue = True
            elif goal is not None and goal.target_date is not None and goal.target_date.date() < on_date:
                overdue = True

        rows.append(
            base.model_copy(
                update={
                    "category": _infer_task_category(task, goal=goal, repetitive=repetitive),
                    "goal_title": goal.title if goal is not None else None,
                    "missed_yesterday": bool(title_key and title_key in missed_yesterday_title_keys),
                    "overdue": overdue,
                    "completed_late": _completed_late(task, timezone_name=timezone_name),
                    "current_habit_streak": (
                        habit_stats.current_streak_days
                        if habit_stats is not None
                        else None
                    ),
                    "previous_completion_history": previous_history,
                    "ai_impact_if_skipped": task.ai_impact_if_skipped,
                    "ai_confidence_score": task.ai_confidence_score,
                }
            )
        )

    return rows


def _workload_label(total_minutes: int) -> str:
    if total_minutes <= 150:
        return "Light"
    if total_minutes <= 330:
        return "Balanced"
    return "Heavy"


def _build_goal_summary(goals: list[Goal]) -> str:
    if not goals:
        return "- none"
    rows: list[str] = []
    for goal in goals[:10]:
        target = goal.target_date.date().isoformat() if goal.target_date else "none"
        rows.append(
            f"- id={goal.id}; title={goal.title}; progress={goal.progress}%; target={target}"
        )
    return "\n".join(rows)


def _build_repetitive_summary(tasks: list[RepetitiveTask]) -> str:
    if not tasks:
        return "- none"
    rows: list[str] = []
    for task in tasks[:12]:
        frequencies = ", ".join(task.frequencies)
        description = " ".join((task.description or "").replace('"', "'").split())
        if description:
            rows.append(
                f"- {task.name} (priority={task.priority.value}; frequencies={frequencies}; description=\"{description[:260]}\")"
            )
        else:
            rows.append(
                f"- {task.name} (priority={task.priority.value}; frequencies={frequencies}; description=none)"
            )
    return "\n".join(rows)


def _build_manual_summary(tasks: list[PlannedTask]) -> str:
    if not tasks:
        return "- none"
    rows: list[str] = []
    for task in tasks[:20]:
        rows.append(f"- {task.title}")
    return "\n".join(rows)


def _build_carry_forward_summary(tasks: list[PlannedTask]) -> str:
    if not tasks:
        return "- none"
    rows: list[str] = []
    for task in tasks[:12]:
        rows.append(f"- {task.title} (priority={task.priority.value})")
    return "\n".join(rows)


@dataclass
class _GeneratedCandidate:
    task: PlanGeneratedTaskInput
    carried_from_date: date | None = None


def _derive_duration_from_suggested_windows(candidates: list[_GeneratedCandidate]) -> None:
    for row in candidates:
        if row.task.estimated_duration_minutes is not None:
            continue
        start_minutes = _hhmm_to_minutes(row.task.suggested_start_time)
        finish_minutes = _hhmm_to_minutes(row.task.suggested_finish_by_time)
        if (
            start_minutes is not None
            and finish_minutes is not None
            and finish_minutes > start_minutes
        ):
            row.task.estimated_duration_minutes = finish_minutes - start_minutes


def _inline_summary_text(value: str | None, *, max_length: int = 240) -> str | None:
    cleaned = _clean_optional_text(value, max_length=max_length)
    if cleaned is None:
        return None
    return cleaned.replace('"', "'")


def _build_duration_estimation_summary(
    candidates: list[_GeneratedCandidate],
    *,
    due_repetitive: list[RepetitiveTask],
    goals_by_id: dict[int, Goal],
) -> str:
    if not candidates:
        return "- none"

    rows: list[str] = []
    for row in candidates:
        title = _clean_optional_text(row.task.title, max_length=_MAX_TITLE_LENGTH)
        if title is None:
            continue

        repetitive = _match_repetitive_task_by_title(title, due_repetitive)
        goal = goals_by_id.get(row.task.related_goal_id) if row.task.related_goal_id is not None else None

        context_bits: list[str] = []
        if repetitive is not None:
            repetitive_description = _inline_summary_text(repetitive.description)
            if repetitive_description:
                context_bits.append(f'habit_description="{repetitive_description}"')
        if goal is not None:
            context_bits.append(f'goal_title="{_inline_summary_text(goal.title, max_length=120) or goal.title}"')
            goal_description = _inline_summary_text(goal.description)
            if goal_description:
                context_bits.append(f'goal_description="{goal_description}"')
        if row.carried_from_date is not None:
            context_bits.append(f"carried_forward_from={row.carried_from_date.isoformat()}")

        context_blob = "; ".join(context_bits) if context_bits else "context=none"
        rows.append(f"- title={title}; {context_blob}")

    return "\n".join(rows) if rows else "- none"


def _estimate_missing_durations(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    on_date: date,
    candidates: list[_GeneratedCandidate],
    due_repetitive: list[RepetitiveTask],
    goals_by_id: dict[int, Goal],
    model: str | None,
) -> None:
    _derive_duration_from_suggested_windows(candidates)

    missing = [
        row
        for row in candidates
        if row.task.estimated_duration_minutes is None
    ]
    if not missing:
        return

    user_context = compile_user_context(db, user)
    tasks_summary = _build_duration_estimation_summary(
        missing,
        due_repetitive=due_repetitive,
        goals_by_id=goals_by_id,
    )

    raw = estimate_today_task_durations_json(
        provider,
        on_date=on_date.isoformat(),
        tasks_summary=tasks_summary,
        user_context=user_context,
        model=model,
    )
    payload = _parse_duration_estimate_payload(raw)

    if payload is None:
        repaired = repair_today_task_durations_json(
            provider,
            on_date=on_date.isoformat(),
            tasks_summary=tasks_summary,
            malformed_output=raw,
            user_context=user_context,
            model=model,
        )
        payload = _parse_duration_estimate_payload(repaired)

    if payload is None:
        return

    duration_by_title: dict[str, int | None] = {}
    for item in payload.durations:
        title_key = _normalize_title(item.title)
        if not title_key:
            continue
        duration_by_title[title_key] = item.estimated_duration_minutes

    for row in missing:
        duration = duration_by_title.get(_normalize_title(row.task.title))
        if duration is not None:
            row.task.estimated_duration_minutes = duration


def _list_due_repetitive_tasks(db: Session, user: User, on_date: date) -> list[RepetitiveTask]:
    rows = _list_active_repetitive_tasks(db, user)
    due = [
        row
        for row in rows
        if any(_frequency_matches_day(freq, on_date) for freq in row.frequencies)
    ]
    due.sort(key=lambda task: (_priority_sort_key(_priority_from_repetitive(task.priority.value)), task.name.lower()))
    return due


def _carry_forward_candidates(yesterday_open: list[PlannedTask]) -> list[_GeneratedCandidate]:
    candidates: list[_GeneratedCandidate] = []
    for task in yesterday_open[:_MAX_CARRY_FORWARD]:
        title = task.title.strip()
        if not title:
            continue
        priority = task.priority
        if priority in {PlannedTaskPriority.low, PlannedTaskPriority.medium}:
            priority = PlannedTaskPriority.high

        candidates.append(
            _GeneratedCandidate(
                task=PlanGeneratedTaskInput(
                    title=title,
                    related_goal_id=task.related_goal_id,
                    priority=priority,
                    estimated_duration_minutes=None,
                    suggested_start_time=None,
                    suggested_finish_by_time=None,
                    ai_rationale="Carry-forward from yesterday's unfinished plan.",
                    ai_impact_if_skipped=(
                        "Skipping this again can compound pending work and increase stress tomorrow."
                    ),
                    ai_confidence_score=88,
                ),
                carried_from_date=task.date,
            )
        )
    return candidates


def _deterministic_candidates(
    *,
    goals: list[Goal],
    due_repetitive: list[RepetitiveTask],
    carry_forward: list[_GeneratedCandidate],
    existing_title_keys: set[str],
) -> list[_GeneratedCandidate]:
    merged = _merge_candidates(carry_forward, [], existing_title_keys, _MAX_GENERATED_TASKS)
    active_goal_ids = {goal.id for goal in goals}

    repetitive_candidates: list[_GeneratedCandidate] = []
    for task in due_repetitive:
        repetitive_candidates.append(
            _GeneratedCandidate(
                task=PlanGeneratedTaskInput(
                    title=task.name[:_MAX_TITLE_LENGTH],
                    related_goal_id=_pick_goal_id_from_repetitive(task, active_goal_ids),
                    priority=_priority_from_repetitive(task.priority.value),
                    estimated_duration_minutes=None,
                    ai_rationale=(task.description or "Recurring commitment due today.")[:2000],
                    ai_impact_if_skipped=(
                        "Skipping this weakens your routine consistency and lowers momentum for today."
                    ),
                    ai_confidence_score=84,
                )
            )
        )

    goal_candidates: list[_GeneratedCandidate] = []
    ordered_goals = sorted(goals, key=lambda goal: (goal.progress, goal.id))
    for goal in ordered_goals[:6]:
        title = f"Move '{goal.title}' forward"[:_MAX_TITLE_LENGTH]
        priority = PlannedTaskPriority.medium
        if goal.target_date:
            days_left = (goal.target_date.date() - date.today()).days
            if days_left <= 14:
                priority = PlannedTaskPriority.high
        goal_candidates.append(
            _GeneratedCandidate(
                task=PlanGeneratedTaskInput(
                    title=title,
                    related_goal_id=goal.id,
                    priority=priority,
                    estimated_duration_minutes=None,
                    ai_rationale="Direct progress on an active goal.",
                    ai_impact_if_skipped=(
                        "Delaying this reduces progress on an active goal and risks deadline pressure."
                    ),
                    ai_confidence_score=78,
                )
            )
        )

    merged = _merge_candidates(merged, repetitive_candidates, existing_title_keys, _MAX_GENERATED_TASKS)
    merged = _merge_candidates(merged, goal_candidates, existing_title_keys, _MAX_GENERATED_TASKS)
    return merged


def _merge_candidates(
    base: list[_GeneratedCandidate],
    extras: list[_GeneratedCandidate],
    existing_title_keys: set[str],
    limit: int,
) -> list[_GeneratedCandidate]:
    merged: list[_GeneratedCandidate] = []
    seen = set(existing_title_keys)

    for row in [*base, *extras]:
        title_key = _normalize_title(row.task.title)
        if not title_key or title_key in seen:
            continue
        seen.add(title_key)
        merged.append(row)
        if len(merged) >= limit:
            break
    return merged


def _apply_repetitive_time_hints(
    candidates: list[_GeneratedCandidate],
    due_repetitive: list[RepetitiveTask],
) -> None:
    hints: list[tuple[str, str | None, str | None, int | None]] = []
    for task in due_repetitive:
        start, end = _extract_time_window(task.description)
        duration_minutes = _extract_duration_hint_minutes(task.description)
        if start is None and end is None and duration_minutes is None:
            continue
        hints.append((_normalize_title(task.name), start, end, duration_minutes))

    if not hints:
        return

    for row in candidates:
        title_key = _normalize_title(row.task.title)
        if not title_key:
            continue

        for hint_title, hint_start, hint_end, hint_duration_minutes in hints:
            if not hint_title:
                continue
            if _title_keys_match(title_key, hint_title):
                if hint_start:
                    row.task.suggested_start_time = hint_start
                if hint_end:
                    row.task.suggested_finish_by_time = hint_end

                start_minutes = _hhmm_to_minutes(row.task.suggested_start_time)
                finish_minutes = _hhmm_to_minutes(row.task.suggested_finish_by_time)
                if (
                    start_minutes is not None
                    and finish_minutes is not None
                    and finish_minutes > start_minutes
                ):
                    row.task.estimated_duration_minutes = finish_minutes - start_minutes
                elif hint_duration_minutes is not None:
                    row.task.estimated_duration_minutes = hint_duration_minutes
                break


def _generate_ai_candidates(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    on_date: date,
    goals: list[Goal],
    due_repetitive: list[RepetitiveTask],
    manual_tasks: list[PlannedTask],
    yesterday_open: list[PlannedTask],
    model: str | None,
) -> list[_GeneratedCandidate]:
    user_context = compile_user_context(db, user)
    goals_summary = _build_goal_summary(goals)
    repetitive_summary = _build_repetitive_summary(due_repetitive)
    carry_forward_summary = _build_carry_forward_summary(yesterday_open)
    manual_summary = _build_manual_summary(manual_tasks)

    raw = generate_today_plan_json(
        provider,
        on_date=on_date.isoformat(),
        goals_summary=goals_summary,
        repetitive_summary=repetitive_summary,
        carry_forward_summary=carry_forward_summary,
        manual_tasks_summary=manual_summary,
        user_context=user_context,
        model=model,
    )
    payload = _parse_generation_payload(raw)

    if payload is None:
        repaired = repair_today_plan_json(
            provider,
            on_date=on_date.isoformat(),
            malformed_output=raw,
            goals_summary=goals_summary,
            repetitive_summary=repetitive_summary,
            carry_forward_summary=carry_forward_summary,
            manual_tasks_summary=manual_summary,
            user_context=user_context,
            model=model,
        )
        payload = _parse_generation_payload(repaired)

    if payload is None:
        retry_raw = generate_today_plan_json(
            provider,
            on_date=on_date.isoformat(),
            goals_summary=goals_summary,
            repetitive_summary=repetitive_summary,
            carry_forward_summary=carry_forward_summary,
            manual_tasks_summary=manual_summary,
            user_context=user_context,
            model=model,
        )
        payload = _parse_generation_payload(retry_raw)
        if payload is None:
            retry_repaired = repair_today_plan_json(
                provider,
                on_date=on_date.isoformat(),
                malformed_output=retry_raw,
                goals_summary=goals_summary,
                repetitive_summary=repetitive_summary,
                carry_forward_summary=carry_forward_summary,
                manual_tasks_summary=manual_summary,
                user_context=user_context,
                model=model,
            )
            payload = _parse_generation_payload(retry_repaired)

    if payload is None or not payload.tasks:
        return []

    return [_GeneratedCandidate(task=task) for task in payload.tasks[:_MAX_GENERATED_TASKS]]


def _build_execution_order(
    tasks: list[PlannedTask],
) -> list[PlanExecutionItem]:
    pending = [task for task in tasks if task.status != PlannedTaskStatus.done]
    pending.sort(
        key=lambda task: (
            _priority_sort_key(task.priority),
            task.execution_order is None,
            task.execution_order or 10_000,
            _hhmm_to_minutes(task.suggested_start_time) or 10_000,
            task.id,
        )
    )

    return [
        PlanExecutionItem(
            task_id=task.id,
            title=task.title,
            source=task.source,
            priority=task.priority,
            estimated_duration_minutes=task.estimated_duration_minutes,
            suggested_start_time=task.suggested_start_time,
            suggested_finish_by_time=task.suggested_finish_by_time,
        )
        for task in pending
    ]


def _build_insights(
    db: Session,
    user: User,
    *,
    on_date: date,
    tasks: list[PlannedTask],
    default_duration: int,
    habit_summary: list[PlanHabitStreakItem],
) -> PlanInsightsRead:
    yesterday = on_date - timedelta(days=1)
    yesterday_tasks = list_tasks(db, user, on_date=yesterday)
    missed_yesterday = [
        task for task in yesterday_tasks if task.status != PlannedTaskStatus.done
    ]
    missed_titles = [task.title for task in missed_yesterday][:8]
    pending_today = [task for task in tasks if task.status != PlannedTaskStatus.done]

    carry_titles: list[str] = []
    seen_carry: set[str] = set()
    for task in pending_today:
        if task.carried_from_date == yesterday and task.title not in seen_carry:
            seen_carry.add(task.title)
            carry_titles.append(task.title)

    highest_priority_task = None
    if pending_today:
        highest_priority_task = sorted(
            pending_today,
            key=lambda task: (
                _priority_sort_key(task.priority),
                task.execution_order is None,
                task.execution_order or 10_000,
                task.id,
            ),
        )[0]

    workload_minutes = sum(
        task.estimated_duration_minutes
        for task in pending_today
        if task.estimated_duration_minutes is not None
    )

    highest_priority_message = None
    if highest_priority_task is None:
        if tasks and not pending_today:
            highest_priority_message = "All planned work is complete. Keep this momentum going."
        else:
            highest_priority_message = "No pending tasks yet. Generate a plan or add your first task."

    return PlanInsightsRead(
        missed_yesterday_count=len(missed_yesterday),
        missed_yesterday_titles=missed_titles,
        carry_forward_count=len(carry_titles),
        carry_forward_titles=carry_titles,
        highest_priority_task_title=highest_priority_task.title if highest_priority_task else None,
        highest_priority_message=highest_priority_message,
        estimated_tasks_count=len(pending_today),
        estimated_workload_minutes=workload_minutes,
        workload_label=_workload_label(workload_minutes),
        habit_streak_summary=habit_summary,
    )


def list_tasks(db: Session, user: User, *, on_date: date | None = None) -> list[PlannedTask]:
    stmt = select(PlannedTask).where(PlannedTask.user_id == user.id)
    if on_date is not None:
        stmt = stmt.where(PlannedTask.date == on_date)
        return list(
            db.scalars(
                stmt.order_by(
                    PlannedTask.status == PlannedTaskStatus.done,
                    PlannedTask.execution_order.is_(None),
                    PlannedTask.execution_order,
                    PlannedTask.id,
                )
            )
        )

    return list(
        db.scalars(
            stmt.order_by(
                PlannedTask.date.desc(),
                PlannedTask.execution_order.is_(None),
                PlannedTask.execution_order,
                PlannedTask.id,
            )
        )
    )


def create_task(db: Session, user: User, data: PlannedTaskCreate) -> PlannedTask:
    settings = settings_service.get_user_settings_row(db, user)
    task_date = data.date or date.today()
    reminder_time = (
        data.reminder_time
        if data.reminder_time is not None
        else settings.default_reminder_time
    )
    estimated_duration = (
        data.estimated_duration_minutes
        if data.estimated_duration_minutes is not None
        else settings.default_task_duration_minutes
    )
    source = data.source or PlannedTaskSource.manual
    priority = data.priority or PlannedTaskPriority.medium
    related_goal_id = _validate_related_goal_id(db, user, data.related_goal_id)

    task = PlannedTask(
        user_id=user.id,
        title=data.title,
        date=task_date,
        reminder_time=reminder_time,
        estimated_duration_minutes=estimated_duration,
        source=source,
        priority=priority,
        ai_rationale=_clean_optional_text(data.ai_rationale),
        ai_impact_if_skipped=_clean_optional_text(data.ai_impact_if_skipped),
        ai_confidence_score=_normalize_confidence_score(data.ai_confidence_score),
        suggested_start_time=data.suggested_start_time,
        suggested_finish_by_time=data.suggested_finish_by_time,
        execution_order=data.execution_order,
        carried_from_date=data.carried_from_date,
        generated_at=(data.generated_at or utcnow())
        if source == PlannedTaskSource.ai_generated
        else data.generated_at,
        related_goal_id=related_goal_id,
    )
    db.add(task)

    should_schedule_reminder = (
        source != PlannedTaskSource.ai_generated
        and settings.notifications_enabled
        and settings.reminder_notifications_enabled
        and reminder_time is not None
    )
    if should_schedule_reminder:
        db.add(
            Notification(
                user_id=user.id,
                title=f"Task reminder: {data.title}",
                body=f"Scheduled reminder for {task_date.isoformat()} at {reminder_time}.",
                type=NotificationType.reminder,
                related_goal_id=related_goal_id,
                scheduled_at=_to_utc_for_user(task_date, reminder_time, user.timezone),
            )
        )

    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, user: User, task_id: int, data: PlannedTaskUpdate) -> PlannedTask:
    task = get_owned_or_404(db, PlannedTask, task_id, user.id, name="Task")
    updates = data.model_dump(exclude_unset=True)

    if "related_goal_id" in updates:
        updates["related_goal_id"] = _validate_related_goal_id(
            db,
            user,
            updates["related_goal_id"],
        )

    if "ai_rationale" in updates and updates["ai_rationale"] is not None:
        updates["ai_rationale"] = _clean_optional_text(updates["ai_rationale"])

    if "ai_impact_if_skipped" in updates and updates["ai_impact_if_skipped"] is not None:
        updates["ai_impact_if_skipped"] = _clean_optional_text(updates["ai_impact_if_skipped"])

    if "ai_confidence_score" in updates:
        updates["ai_confidence_score"] = _normalize_confidence_score(updates["ai_confidence_score"])

    for field, value in updates.items():
        setattr(task, field, value)

    if "source" in updates:
        if task.source == PlannedTaskSource.ai_generated and task.generated_at is None:
            task.generated_at = utcnow()
        if task.source != PlannedTaskSource.ai_generated:
            task.generated_at = None

    if "status" in updates:
        if task.status == PlannedTaskStatus.done and task.completed_at is None:
            task.completed_at = utcnow()
        elif task.status != PlannedTaskStatus.done:
            task.completed_at = None
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, user: User, task_id: int) -> None:
    task = get_owned_or_404(db, PlannedTask, task_id, user.id, name="Task")
    db.delete(task)
    db.commit()


def workspace_for_date(
    db: Session,
    user: User,
    *,
    on_date: date | None = None,
) -> PlanWorkspaceRead:
    target_date = on_date or date.today()
    settings = settings_service.get_user_settings_row(db, user)
    tasks = list_tasks(db, user, on_date=target_date)

    goal_ids = {task.related_goal_id for task in tasks if task.related_goal_id is not None}
    goals_by_id: dict[int, Goal] = {}
    if goal_ids:
        goals_by_id = {
            goal.id: goal
            for goal in db.scalars(
                select(Goal).where(
                    Goal.user_id == user.id,
                    Goal.id.in_(goal_ids),
                )
            )
        }

    active_repetitive = _list_active_repetitive_tasks(db, user)
    due_repetitive = _list_due_repetitive_tasks(db, user, target_date)

    history_rows = _list_task_history_window(db, user, on_date=target_date)
    history_by_title = _group_history_by_title(history_rows)

    yesterday_tasks = list_tasks(db, user, on_date=target_date - timedelta(days=1))
    missed_yesterday_title_keys = {
        key
        for task in yesterday_tasks
        if task.status != PlannedTaskStatus.done
        for key in [_normalize_title(task.title)]
        if key
    }

    workspace_tasks = _build_workspace_task_rows(
        tasks=tasks,
        goals_by_id=goals_by_id,
        repetitive_tasks=active_repetitive,
        history_by_title=history_by_title,
        missed_yesterday_title_keys=missed_yesterday_title_keys,
        on_date=target_date,
        timezone_name=user.timezone,
    )
    habit_summary = _build_habit_summary(
        due_repetitive,
        history_by_title,
        on_date=target_date,
    )

    execution_order = _build_execution_order(
        tasks,
    )
    insights = _build_insights(
        db,
        user,
        on_date=target_date,
        tasks=tasks,
        default_duration=settings.default_task_duration_minutes,
        habit_summary=habit_summary,
    )

    latest_generated = max(
        (
            task.generated_at
            for task in tasks
            if task.source == PlannedTaskSource.ai_generated and task.generated_at is not None
        ),
        default=None,
    )

    return PlanWorkspaceRead(
        date=target_date,
        tasks=workspace_tasks,
        insights=insights,
        execution_order=execution_order,
        generated_at=latest_generated,
    )


def generate_today_plan(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    on_date: date | None = None,
) -> PlanWorkspaceRead:
    target_date = on_date or date.today()
    settings = settings_service.get_user_settings_row(db, user)

    if not settings.smart_planning_enabled:
        raise AppError(
            "Smart planning is disabled. Enable it in Settings > AI Behavior to generate today's plan."
        )

    todays_tasks = list_tasks(db, user, on_date=target_date)
    manual_tasks = [
        task for task in todays_tasks if task.source != PlannedTaskSource.ai_generated
    ]
    manual_title_keys = {_normalize_title(task.title) for task in manual_tasks}

    for task in todays_tasks:
        if task.source == PlannedTaskSource.ai_generated:
            db.delete(task)
    db.flush()

    active_goals = list(
        db.scalars(
            select(Goal)
            .where(Goal.user_id == user.id, Goal.status == GoalStatus.active)
            .order_by(Goal.updated_at.desc(), Goal.id.desc())
        )
    )
    goals_by_id = {goal.id: goal for goal in active_goals}
    owned_goal_ids = {goal.id for goal in active_goals}

    active_repetitive = _list_active_repetitive_tasks(db, user)
    due_repetitive = _list_due_repetitive_tasks(db, user, target_date)

    yesterday_open = [
        task
        for task in list_tasks(db, user, on_date=target_date - timedelta(days=1))
        if task.status != PlannedTaskStatus.done
    ]

    carry_forward_seed = [
        task
        for task in yesterday_open
        if task.source == PlannedTaskSource.manual
        and not _is_repetitive_title(task.title, active_repetitive)
    ]

    carry_forward = _carry_forward_candidates(carry_forward_seed)
    preferred_model = settings_service.get_effective_ai_model(db, user)
    ai_candidates = _generate_ai_candidates(
        db,
        user,
        provider,
        on_date=target_date,
        goals=active_goals,
        due_repetitive=due_repetitive,
        manual_tasks=manual_tasks,
        yesterday_open=carry_forward_seed,
        model=preferred_model,
    )

    if ai_candidates:
        generated = _merge_candidates(
            carry_forward,
            ai_candidates,
            manual_title_keys,
            _MAX_GENERATED_TASKS,
        )
        if len(generated) < 3:
            generated = _merge_candidates(
                generated,
                _deterministic_candidates(
                    goals=active_goals,
                    due_repetitive=due_repetitive,
                    carry_forward=carry_forward,
                    existing_title_keys=manual_title_keys,
                ),
                manual_title_keys,
                _MAX_GENERATED_TASKS,
            )
    else:
        generated = _deterministic_candidates(
            goals=active_goals,
            due_repetitive=due_repetitive,
            carry_forward=carry_forward,
            existing_title_keys=manual_title_keys,
        )

    filtered: list[_GeneratedCandidate] = []
    seen_impact_keys: set[str] = set()
    for row in generated:
        title = row.task.title.strip()[:_MAX_TITLE_LENGTH]
        if not title:
            continue
        related_goal_id = row.task.related_goal_id
        if related_goal_id is None:
            related_goal_id = _infer_goal_id_from_repetitive_title(
                title,
                due_repetitive,
                owned_goal_ids,
            )
        if related_goal_id is not None and related_goal_id not in owned_goal_ids:
            related_goal_id = None

        goal_title = None
        if related_goal_id is not None:
            goal_title = goals_by_id.get(related_goal_id).title if related_goal_id in goals_by_id else None

        is_habit = _is_repetitive_title(title, due_repetitive)
        rationale, impact_if_skipped, confidence_score = _normalize_generated_accountability(
            row,
            goal_title=goal_title,
            is_habit=is_habit,
        )
        impact_key = _impact_key(impact_if_skipped)
        if impact_key in seen_impact_keys:
            impact_if_skipped = _default_impact_if_skipped(
                task_title=title,
                priority=row.task.priority,
                carried_from_date=row.carried_from_date,
                goal_title=goal_title,
                is_habit=is_habit,
            )
            impact_key = _impact_key(impact_if_skipped)
        if impact_key:
            seen_impact_keys.add(impact_key)

        filtered.append(
            _GeneratedCandidate(
                task=PlanGeneratedTaskInput(
                    title=title,
                    related_goal_id=related_goal_id,
                    priority=row.task.priority,
                    estimated_duration_minutes=row.task.estimated_duration_minutes,
                    suggested_start_time=row.task.suggested_start_time,
                    suggested_finish_by_time=row.task.suggested_finish_by_time,
                    ai_rationale=rationale,
                    ai_impact_if_skipped=impact_if_skipped,
                    ai_confidence_score=confidence_score,
                ),
                carried_from_date=row.carried_from_date,
            )
        )

    _apply_repetitive_time_hints(filtered, due_repetitive)
    _estimate_missing_durations(
        db,
        user,
        provider,
        on_date=target_date,
        candidates=filtered,
        due_repetitive=due_repetitive,
        goals_by_id=goals_by_id,
        model=preferred_model,
    )

    generated_at = utcnow()
    for index, row in enumerate(filtered, start=1):
        db.add(
            PlannedTask(
                user_id=user.id,
                title=row.task.title,
                date=target_date,
                reminder_time=row.task.suggested_start_time,
                estimated_duration_minutes=row.task.estimated_duration_minutes,
                status=PlannedTaskStatus.planned,
                source=PlannedTaskSource.ai_generated,
                priority=row.task.priority,
                ai_rationale=row.task.ai_rationale,
                ai_impact_if_skipped=row.task.ai_impact_if_skipped,
                ai_confidence_score=row.task.ai_confidence_score,
                suggested_start_time=row.task.suggested_start_time,
                suggested_finish_by_time=row.task.suggested_finish_by_time,
                execution_order=index,
                carried_from_date=row.carried_from_date,
                generated_at=generated_at,
                related_goal_id=row.task.related_goal_id,
            )
        )

    db.commit()
    return workspace_for_date(db, user, on_date=target_date)


def upcoming_tasks(db: Session, user: User, *, limit: int = 5) -> list[PlannedTask]:
    today = date.today()
    return list(
        db.scalars(
            select(PlannedTask)
            .where(
                PlannedTask.user_id == user.id,
                PlannedTask.date >= today,
                PlannedTask.status == PlannedTaskStatus.planned,
            )
            .order_by(
                PlannedTask.date,
                PlannedTask.execution_order.is_(None),
                PlannedTask.execution_order,
                PlannedTask.id,
            )
            .limit(limit)
        )
    )
