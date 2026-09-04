"""Tracked-metric & activity-log business logic, plus roll-up summaries."""

from __future__ import annotations

from datetime import date, timedelta
import json

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.agents.orchestrator import (
    generate_metric_draft_from_prompt,
    repair_metric_draft_json,
)
from app.llm.base import LLMProvider
from app.models.activity import ActivityLog
from app.memory.context import compile_user_context
from app.models.enums import ActivitySource, MetricTimeSpan, MetricType, MetricUnit
from app.models.metric import TrackedMetric
from app.models.notification import Notification
from app.models.repetitive_task import RepetitiveTask, RepetitiveTaskMetricLink
from app.models.user import User
from app.schemas.activity import ActivityLogCreate
from app.schemas.metric import MetricCreate, MetricDraftRead, MetricUpdate
from app.services import settings_service
from app.services.exceptions import AppError, ConflictError, NotFoundError
from app.services.utils import get_owned_or_404

# Seeded for every new user as sensible starting metrics.
DEFAULT_METRICS: list[dict] = [
    {
        "key": "deep_work_minutes",
        "label": "Deep-work time",
        "unit": MetricUnit.minutes,
        "unit_text": "minutes",
        "time_span": MetricTimeSpan.day,
        "target": 180,
    },
    {
        "key": "tasks_completed",
        "label": "Tasks completed",
        "unit": MetricUnit.count,
        "unit_text": "tasks",
        "time_span": MetricTimeSpan.day,
        "target": None,
    },
]

_MINUTE_UNITS = {"minute", "minutes", "min", "mins"}
_HOUR_UNITS = {"hour", "hours", "hr", "hrs", "h"}
_COUNT_KEYWORDS = {
    "count",
    "counts",
    "times",
    "time",
    "tasks",
    "task",
    "problems",
    "problem",
    "questions",
    "question",
    "reps",
    "rep",
    "sets",
    "set",
    "steps",
    "step",
    "pages",
    "page",
    "sessions",
    "session",
    "glasses",
    "glass",
}
_PROGRESS_COACH_TITLE_PREFIX = "__internal_progress_coach_metric_recommendation__:habit:"


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
        return "\n".join(lines[1:-1]).strip()
    return text


def _parse_json_dict(raw: str) -> dict[str, object] | None:
    text = _strip_markdown_fence(raw)
    if not text:
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            payload = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return payload if isinstance(payload, dict) else None


def _canonical_unit_text(unit: MetricUnit) -> str:
    if unit == MetricUnit.minutes:
        return "minutes"
    if unit == MetricUnit.hours:
        return "hours"
    if unit == MetricUnit.count:
        return "count"
    return "custom"


def _normalize_unit_fields(
    *,
    unit: MetricUnit | None,
    unit_text: str | None,
) -> tuple[MetricUnit, str]:
    text = (unit_text or "").strip().lower()
    if text:
        if text in _MINUTE_UNITS:
            return MetricUnit.minutes, "minutes"
        if text in _HOUR_UNITS:
            return MetricUnit.hours, "hours"
        if text in _COUNT_KEYWORDS:
            return MetricUnit.count, text
        return MetricUnit.custom, text

    if unit is None:
        return MetricUnit.count, "count"
    return unit, _canonical_unit_text(unit)


def _normalize_time_span_fields(
    *,
    time_span: MetricTimeSpan,
    time_span_custom_text: str | None,
) -> tuple[MetricTimeSpan, str | None]:
    custom_text = (time_span_custom_text or "").strip()
    if time_span == MetricTimeSpan.custom:
        if not custom_text:
            raise AppError("Custom time span requires a label (for example: Sprint).")
        return time_span, custom_text[:64]

    if custom_text:
        raise AppError("Custom time span text is only allowed when time span is Custom.")
    return time_span, None


def _normalize_ids(values: list[int]) -> list[int]:
    ordered: list[int] = []
    seen: set[int] = set()
    for value in values:
        if value <= 0 or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _ensure_owned_habit_ids(db: Session, user_id: int, habit_ids: list[int]) -> list[int]:
    normalized = _normalize_ids(habit_ids)
    if not normalized:
        return []

    owned = set(
        db.scalars(
            select(RepetitiveTask.id).where(
                RepetitiveTask.user_id == user_id,
                RepetitiveTask.id.in_(normalized),
            )
        )
    )
    if len(owned) != len(normalized):
        raise NotFoundError("Repetitive task not found")
    return normalized


def _replace_metric_habit_links(db: Session, metric_id: int, habit_ids: list[int]) -> None:
    db.execute(delete(RepetitiveTaskMetricLink).where(RepetitiveTaskMetricLink.metric_id == metric_id))
    if habit_ids:
        db.add_all(
            [
                RepetitiveTaskMetricLink(repetitive_task_id=habit_id, metric_id=metric_id)
                for habit_id in habit_ids
            ]
        )


def _clear_pending_progress_coach_recommendations(
    db: Session,
    user_id: int,
    habit_ids: list[int],
) -> None:
    if not habit_ids:
        return

    titles = [f"{_PROGRESS_COACH_TITLE_PREFIX}{habit_id}" for habit_id in _normalize_ids(habit_ids)]
    if not titles:
        return

    db.execute(
        delete(Notification).where(
            Notification.user_id == user_id,
            Notification.title.in_(titles),
        )
    )


def _parse_draft_target(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        rounded = int(round(float(value)))
        return rounded if rounded >= 0 else None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            rounded = int(round(float(text)))
        except ValueError:
            return None
        return rounded if rounded >= 0 else None
    return None


def ensure_default_metrics(db: Session, user: User) -> list[TrackedMetric]:
    """Create any missing default metrics for ``user`` (idempotent)."""
    existing = set(
        db.scalars(select(TrackedMetric.key).where(TrackedMetric.user_id == user.id))
    )
    created: list[TrackedMetric] = []
    for spec in DEFAULT_METRICS:
        if spec["key"] in existing:
            continue
        metric = TrackedMetric(
            user_id=user.id,
            key=spec["key"],
            label=spec["label"],
            unit=spec["unit"],
            unit_text=spec["unit_text"],
            time_span=spec["time_span"],
            time_span_custom_text=None,
            type=MetricType.default,
            target=spec["target"],
            active=True,
        )
        db.add(metric)
        created.append(metric)
    if created:
        db.commit()
        for metric in created:
            db.refresh(metric)
    return created


def list_metrics(db: Session, user: User, *, include_inactive: bool = False) -> list[TrackedMetric]:
    stmt = select(TrackedMetric).where(TrackedMetric.user_id == user.id)
    if not include_inactive:
        stmt = stmt.where(TrackedMetric.active.is_(True))
    stmt = stmt.options(selectinload(TrackedMetric.task_links))
    return list(db.scalars(stmt.order_by(TrackedMetric.created_at)))


def draft_metric_from_prompt(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    prompt: str,
) -> MetricDraftRead:
    preferred_model = settings_service.get_effective_ai_model(db, user)
    user_context = compile_user_context(db, user)
    raw = generate_metric_draft_from_prompt(
        provider,
        prompt_text=prompt,
        user_context=user_context,
        model=preferred_model,
    )

    payload = _parse_json_dict(raw)
    if payload is None:
        repaired = repair_metric_draft_json(
            provider,
            prompt_text=prompt,
            malformed_output=raw,
            user_context=user_context,
            model=preferred_model,
        )
        payload = _parse_json_dict(repaired)

    if payload is None:
        retry_raw = generate_metric_draft_from_prompt(
            provider,
            prompt_text=prompt,
            user_context=user_context,
            model=preferred_model,
        )
        payload = _parse_json_dict(retry_raw)

        if payload is None:
            retry_repaired = repair_metric_draft_json(
                provider,
                prompt_text=prompt,
                malformed_output=retry_raw,
                user_context=user_context,
                model=preferred_model,
            )
            payload = _parse_json_dict(retry_repaired)

    if payload is None:
        raise AppError("Shadow could not structure this metric yet. Please try again.")

    label_raw = payload.get("label")
    label = label_raw.strip() if isinstance(label_raw, str) else ""
    if not label:
        raise AppError("Shadow could not infer a metric name. Please add more detail.")

    unit_text_raw = payload.get("unit_text")
    unit_text = unit_text_raw.strip() if isinstance(unit_text_raw, str) else ""
    if not unit_text:
        raise AppError("Shadow could not infer a metric unit. Please specify one.")

    span_raw = payload.get("time_span")
    if isinstance(span_raw, str):
        span_key = span_raw.strip().lower()
    else:
        span_key = "day"
    try:
        time_span = MetricTimeSpan(span_key)
    except ValueError as exc:
        raise AppError("Shadow returned an unsupported time span. Please try again.") from exc

    custom_span_raw = payload.get("time_span_custom_text")
    custom_span = custom_span_raw.strip() if isinstance(custom_span_raw, str) else None
    _, normalized_custom_span = _normalize_time_span_fields(
        time_span=time_span,
        time_span_custom_text=custom_span,
    )

    target = _parse_draft_target(payload.get("target"))
    rationale_raw = payload.get("rationale")
    rationale = rationale_raw.strip() if isinstance(rationale_raw, str) else None

    return MetricDraftRead(
        label=label[:128],
        unit_text=unit_text[:32],
        time_span=time_span,
        time_span_custom_text=normalized_custom_span,
        target=target,
        rationale=rationale,
    )


def create_metric(db: Session, user: User, data: MetricCreate) -> TrackedMetric:
    exists = db.scalar(
        select(TrackedMetric).where(
            TrackedMetric.user_id == user.id, TrackedMetric.key == data.key
        )
    )
    if exists is not None:
        raise ConflictError(f"Metric '{data.key}' already exists")

    unit, unit_text = _normalize_unit_fields(unit=data.unit, unit_text=data.unit_text)
    time_span, time_span_custom_text = _normalize_time_span_fields(
        time_span=data.time_span,
        time_span_custom_text=data.time_span_custom_text,
    )
    linked_habit_ids = _ensure_owned_habit_ids(db, user.id, data.linked_habit_ids)

    metric = TrackedMetric(
        user_id=user.id,
        key=data.key,
        label=data.label,
        unit=unit,
        unit_text=unit_text,
        time_span=time_span,
        time_span_custom_text=time_span_custom_text,
        type=MetricType.custom,
        target=data.target,
        active=True,
    )
    db.add(metric)
    db.flush()
    _replace_metric_habit_links(db, metric.id, linked_habit_ids)
    _clear_pending_progress_coach_recommendations(db, user.id, linked_habit_ids)
    metric_id = metric.id
    db.commit()
    persisted = db.scalar(
        select(TrackedMetric)
        .options(selectinload(TrackedMetric.task_links))
        .where(
            TrackedMetric.user_id == user.id,
            TrackedMetric.id == metric_id,
        )
    )
    if persisted is None:
        raise NotFoundError("Metric not found")
    return persisted


def update_metric(db: Session, user: User, metric_id: int, data: MetricUpdate) -> TrackedMetric:
    metric = get_owned_or_404(db, TrackedMetric, metric_id, user.id, name="Metric")
    updates = data.model_dump(exclude_unset=True)

    if "label" in updates:
        metric.label = updates["label"]

    if "unit" in updates or "unit_text" in updates:
        next_unit = updates.get("unit", metric.unit)
        next_unit_text = updates.get("unit_text") if "unit_text" in updates else None
        unit, unit_text = _normalize_unit_fields(unit=next_unit, unit_text=next_unit_text)
        metric.unit = unit
        metric.unit_text = unit_text

    if "time_span" in updates or "time_span_custom_text" in updates:
        next_time_span = updates.get("time_span", metric.time_span)
        next_time_span_custom_text = updates.get(
            "time_span_custom_text",
            metric.time_span_custom_text,
        )
        time_span, time_span_custom_text = _normalize_time_span_fields(
            time_span=next_time_span,
            time_span_custom_text=next_time_span_custom_text,
        )
        metric.time_span = time_span
        metric.time_span_custom_text = time_span_custom_text

    if "target" in updates:
        metric.target = updates["target"]

    if "active" in updates:
        metric.active = updates["active"]

    if "linked_habit_ids" in updates:
        linked_habit_ids = _ensure_owned_habit_ids(db, user.id, updates["linked_habit_ids"] or [])
        _replace_metric_habit_links(db, metric.id, linked_habit_ids)
        _clear_pending_progress_coach_recommendations(db, user.id, linked_habit_ids)

    persisted_id = metric.id
    db.commit()
    persisted = db.scalar(
        select(TrackedMetric)
        .options(selectinload(TrackedMetric.task_links))
        .where(
            TrackedMetric.user_id == user.id,
            TrackedMetric.id == persisted_id,
        )
    )
    if persisted is None:
        raise NotFoundError("Metric not found")
    return persisted


def delete_metric(db: Session, user: User, metric_id: int) -> None:
    metric = get_owned_or_404(db, TrackedMetric, metric_id, user.id, name="Metric")
    db.delete(metric)
    db.commit()


def add_log(db: Session, user: User, metric_id: int, data: ActivityLogCreate) -> ActivityLog:
    metric = get_owned_or_404(db, TrackedMetric, metric_id, user.id, name="Metric")
    log = ActivityLog(
        user_id=user.id,
        metric_id=metric.id,
        date=data.date or date.today(),
        value=data.value,
        note=data.note,
        source=ActivitySource.manual,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_logs(db: Session, user: User, metric_id: int) -> list[ActivityLog]:
    metric = get_owned_or_404(db, TrackedMetric, metric_id, user.id, name="Metric")
    return list(
        db.scalars(
            select(ActivityLog)
            .where(ActivityLog.metric_id == metric.id)
            .order_by(ActivityLog.date.desc(), ActivityLog.id.desc())
        )
    )


def sum_between(db: Session, metric_id: int, start: date, end: date) -> float:
    values = list(
        db.scalars(
            select(ActivityLog.value).where(
                ActivityLog.metric_id == metric_id,
                ActivityLog.date >= start,
                ActivityLog.date <= end,
            )
        )
    )
    return float(sum(values))


def compute_streak(db: Session, metric_id: int, *, today: date | None = None) -> int:
    """Count consecutive days (ending today) that logged a positive value."""
    today = today or date.today()
    positive_dates = set(
        db.scalars(
            select(ActivityLog.date).where(
                ActivityLog.metric_id == metric_id, ActivityLog.value > 0
            )
        )
    )
    streak = 0
    cursor = today
    while cursor in positive_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def metric_summary(db: Session, metric: TrackedMetric) -> dict:
    today = date.today()
    week_start = today - timedelta(days=6)
    return {
        "metric_id": metric.id,
        "key": metric.key,
        "label": metric.label,
        "unit": metric.unit.value,
        "today_total": sum_between(db, metric.id, today, today),
        "week_total": sum_between(db, metric.id, week_start, today),
        "target": metric.target,
        "streak_days": compute_streak(db, metric.id, today=today),
    }
