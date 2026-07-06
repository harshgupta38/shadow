"""Progress Coach metric recommendations for repetitive habits.

Recommendations are generated only when a habit is created/updated and stored
internally without schema changes.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.agents.orchestrator import (
    recommend_progress_metric_json,
    repair_progress_metric_json,
)
from app.llm.base import LLMProvider
from app.models.enums import MetricTimeSpan, MetricUnit, NotificationType
from app.models.goal import Goal
from app.models.metric import TrackedMetric
from app.models.notification import Notification
from app.models.repetitive_task import (
    RepetitiveTask,
    RepetitiveTaskGoalLink,
    RepetitiveTaskMetricLink,
)
from app.models.user import User
from app.schemas.metric import (
    MetricCreate,
    MetricRead,
    MetricUpdate,
    ProgressCoachRecommendationAcceptResponse,
    ProgressCoachRecommendationRead,
)
from app.services import metric_service
from app.services.exceptions import NotFoundError
from app.services.utils import get_owned_or_404

logger = logging.getLogger(__name__)

INTERNAL_PROGRESS_COACH_TITLE_PREFIX = "__internal_progress_coach_metric_recommendation__:habit:"
_RECOMMENDATION_SCHEMA = "PROGRESS_COACH_RECOMMENDATION_V1"

_WEEKLY_FREQUENCIES = {
    "weekly",
    "weekdays",
    "weekends",
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
}
_MONTHLY_FREQUENCIES = {"monthly", "first_of_month", "end_of_month"}
_NON_PROGRESS_PATTERNS = (
    "work from office",
    "work from home",
    "travel to office",
    "travel to home",
    "commute",
    "attendance",
    "pay credit",
    "bill",
    "invoice",
    "first of month",
    "end of month",
)
_QUANTIFIABLE_ACTIVITY_KEYWORDS = (
    "water",
    "hydrate",
    "hydration",
    "workout",
    "exercise",
    "run",
    "jog",
    "walk",
    "cycle",
    "bike",
    "swim",
    "yoga",
    "meditat",
    "pushup",
    "squat",
    "plank",
    "problem",
    "leetcode",
    "question",
    "read",
    "page",
    "chapter",
    "study",
    "practice",
)
_QUANTIFIABLE_UNIT_KEYWORDS = (
    "minute",
    "minutes",
    "hour",
    "hours",
    "km",
    "kilometer",
    "kilometre",
    "meter",
    "metre",
    "mile",
    "miles",
    "ml",
    "liter",
    "litre",
    "gram",
    "grams",
    "kg",
    "kilogram",
    "reps",
    "rep",
    "sets",
    "set",
    "steps",
    "step",
)
_COUNT_EVIDENCE_KEYWORDS = (
    "problem",
    "leetcode",
    "question",
    "page",
    "chapter",
    "rep",
    "pushup",
    "squat",
    "set",
    "glass",
    "bottle",
    "step",
)
_TIME_EVIDENCE_KEYWORDS = (
    "minute",
    "minutes",
    "hour",
    "hours",
    "workout",
    "exercise",
    "run",
    "walk",
    "jog",
    "cycle",
    "swim",
    "study",
    "practice",
    "meditat",
)
_DISTANCE_EVIDENCE_KEYWORDS = (
    "run",
    "walk",
    "jog",
    "cycle",
    "bike",
    "swim",
    "distance",
    "km",
    "kilometer",
    "kilometre",
    "meter",
    "metre",
    "mile",
    "miles",
)
_VOLUME_EVIDENCE_KEYWORDS = (
    "water",
    "hydrate",
    "hydration",
    "drink",
    "ml",
    "liter",
    "litre",
)
_WEIGHT_EVIDENCE_KEYWORDS = (
    "weight",
    "kg",
    "kilogram",
    "gram",
    "grams",
)
_BANNED_METRIC_NAME_KEYWORDS = (
    "streak",
    "attendance",
    "actions completed",
    "action completed",
    "daily completions",
    "habit completion",
    "consistency",
)


class _ExtractorRecommendation(BaseModel):
    measurable: bool
    metric_name: str | None = None
    unit: str | None = None
    daily_target: float | int | str | None = None
    rationale: str | None = None


class _StoredRecommendation(BaseModel):
    schema_version: str = Field(alias="schema")
    habit_id: int
    habit_name: str
    metric_name: str
    metric_key: str
    unit: MetricUnit
    target: int
    unit_hint: str | None = None
    rationale: str


@dataclass(frozen=True)
class _NormalizedRecommendation:
    metric_name: str
    metric_key: str
    unit: MetricUnit
    target: int
    unit_hint: str | None
    rationale: str


def _title_for_habit(habit_id: int) -> str:
    return f"{INTERNAL_PROGRESS_COACH_TITLE_PREFIX}{habit_id}"


def _strip_markdown_fence(raw: str) -> str:
    text = raw.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if len(lines) >= 3 and lines[0].startswith("```") and lines[-1].startswith("```"):
        return "\n".join(lines[1:-1]).strip()
    return text


def _parse_json(raw: str) -> dict[str, Any] | None:
    text = _strip_markdown_fence(raw)
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _habit_text(*, name: str, description: str | None) -> str:
    return " ".join(part for part in (name.strip(), (description or "").strip()) if part).lower()


def _has_numeric_signal(text: str) -> bool:
    return re.search(r"\b\d+(?:\.\d+)?\b", text) is not None


def _is_habit_quantifiable_candidate(
    *,
    habit_name: str,
    habit_description: str | None,
    frequencies: list[str],
) -> bool:
    text = _habit_text(name=habit_name, description=habit_description)
    if not text:
        return False

    has_number = _has_numeric_signal(text)
    has_unit_signal = _contains_any(text, _QUANTIFIABLE_UNIT_KEYWORDS)
    has_activity_signal = _contains_any(text, _QUANTIFIABLE_ACTIVITY_KEYWORDS)

    # Binary/admin/schedule-only habits are not progress metrics unless the
    # habit text contains clear quantity + unit evidence.
    if _contains_any(text, _NON_PROGRESS_PATTERNS) and not (has_number and has_unit_signal):
        return False

    if has_number and (has_unit_signal or has_activity_signal):
        return True

    # Allow canonical measurable habits even when no explicit number is given.
    return has_activity_signal


def _recommendation_time_span_for_frequencies(frequencies: list[str]) -> MetricTimeSpan:
    normalized = {value.strip().lower() for value in frequencies if value and value.strip()}
    if not normalized:
        return MetricTimeSpan.day

    if "daily" in normalized:
        return MetricTimeSpan.day
    if normalized.issubset(_MONTHLY_FREQUENCIES):
        return MetricTimeSpan.month
    if normalized.issubset(_WEEKLY_FREQUENCIES):
        return MetricTimeSpan.week

    if normalized & _MONTHLY_FREQUENCIES and not (normalized & _WEEKLY_FREQUENCIES):
        return MetricTimeSpan.month
    if normalized & _WEEKLY_FREQUENCIES:
        return MetricTimeSpan.week

    return MetricTimeSpan.day


def _is_recommendation_consistent_with_habit(
    recommendation: _NormalizedRecommendation,
    *,
    habit_name: str,
    habit_description: str | None,
    frequencies: list[str],
) -> bool:
    if not _is_habit_quantifiable_candidate(
        habit_name=habit_name,
        habit_description=habit_description,
        frequencies=frequencies,
    ):
        return False

    lowered_metric_name = recommendation.metric_name.lower()
    if _contains_any(lowered_metric_name, _BANNED_METRIC_NAME_KEYWORDS):
        return False

    text = _habit_text(name=habit_name, description=habit_description)

    if recommendation.unit == MetricUnit.count:
        return _contains_any(text, _COUNT_EVIDENCE_KEYWORDS)

    if recommendation.unit in {MetricUnit.minutes, MetricUnit.hours}:
        return _contains_any(text, _TIME_EVIDENCE_KEYWORDS)

    if recommendation.unit == MetricUnit.custom:
        if recommendation.unit_hint == "ml":
            return _contains_any(text, _VOLUME_EVIDENCE_KEYWORDS)
        if recommendation.unit_hint == "m":
            return _contains_any(text, _DISTANCE_EVIDENCE_KEYWORDS)
        if recommendation.unit_hint == "g":
            return _contains_any(text, _WEIGHT_EVIDENCE_KEYWORDS)
        # Unqualified custom units are too ambiguous in strict mode.
        return False

    return False


def _slugify(value: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", value.lower())).strip("_")


def _safe_metric_key(*, habit_id: int, metric_name: str, unit_hint: str | None = None) -> str:
    metric_base = _slugify(metric_name) or "metric"
    if unit_hint:
        unit_base = _slugify(unit_hint)
        if unit_base and unit_base not in metric_base:
            metric_base = f"{metric_base}_{unit_base}"

    prefix = f"habit_{habit_id}_"
    limit = max(1, 64 - len(prefix))
    return f"{prefix}{metric_base[:limit]}".strip("_")


def _to_number(value: float | int | str | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, (float, int)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _normalise_metric_name(value: str | None) -> str | None:
    if value is None:
        return None
    text = " ".join(value.strip().split())
    if not text:
        return None
    return text[:128]


def _normalise_rationale(value: str | None) -> str:
    if value is None:
        return "Track this habit daily to keep progress visible and actionable."
    text = " ".join(value.strip().split())
    if not text:
        return "Track this habit daily to keep progress visible and actionable."
    return text[:300]


def _has_active_linked_metric(db: Session, habit_id: int) -> bool:
    return (
        db.scalar(
            select(TrackedMetric.id)
            .join(
                RepetitiveTaskMetricLink,
                RepetitiveTaskMetricLink.metric_id == TrackedMetric.id,
            )
            .where(
                RepetitiveTaskMetricLink.repetitive_task_id == habit_id,
                TrackedMetric.active.is_(True),
            )
            .limit(1)
        )
        is not None
    )


def _goal_titles_for_habit(db: Session, habit_id: int) -> list[str]:
    return list(
        db.scalars(
            select(Goal.title)
            .join(RepetitiveTaskGoalLink, RepetitiveTaskGoalLink.goal_id == Goal.id)
            .where(RepetitiveTaskGoalLink.repetitive_task_id == habit_id)
            .order_by(Goal.id)
        )
    )


def _linked_metric_labels_for_habit(db: Session, habit_id: int) -> list[str]:
    return list(
        db.scalars(
            select(TrackedMetric.label)
            .join(
                RepetitiveTaskMetricLink,
                RepetitiveTaskMetricLink.metric_id == TrackedMetric.id,
            )
            .where(RepetitiveTaskMetricLink.repetitive_task_id == habit_id)
            .order_by(TrackedMetric.id)
        )
    )


def _clear_pending_recommendation_for_habit(db: Session, user_id: int, habit_id: int) -> None:
    db.execute(
        delete(Notification).where(
            Notification.user_id == user_id,
            Notification.title == _title_for_habit(habit_id),
        )
    )


def _normalise_extractor_output(
    payload: _ExtractorRecommendation,
    *,
    habit_id: int,
    habit_name: str,
    habit_description: str | None,
    frequencies: list[str],
) -> _NormalizedRecommendation | None:
    if not payload.measurable:
        return None

    if not _is_habit_quantifiable_candidate(
        habit_name=habit_name,
        habit_description=habit_description,
        frequencies=frequencies,
    ):
        return None

    metric_name = _normalise_metric_name(payload.metric_name)
    if metric_name is None:
        return None

    lowered_name = metric_name.lower()
    raw_unit = (payload.unit or "").strip().lower()
    if "streak" in lowered_name or "streak" in raw_unit:
        return None

    target_number = _to_number(payload.daily_target)
    if target_number is None or target_number <= 0:
        return None

    unit: MetricUnit
    target: int
    unit_hint: str | None = None

    if raw_unit in {"count", "counts", "times", "reps", "repetitions", "sessions"}:
        unit = MetricUnit.count
        target = int(round(target_number))
    elif raw_unit in {"minutes", "minute", "min", "mins"}:
        unit = MetricUnit.minutes
        target = int(round(target_number))
    elif raw_unit in {"hours", "hour", "hr", "hrs", "h"}:
        if float(target_number).is_integer():
            unit = MetricUnit.hours
            target = int(round(target_number))
        else:
            unit = MetricUnit.minutes
            target = int(round(target_number * 60))
    elif raw_unit in {"liter", "liters", "litre", "litres", "l"}:
        unit = MetricUnit.custom
        target = int(round(target_number * 1000))
        unit_hint = "ml"
    elif raw_unit in {"milliliter", "milliliters", "ml"}:
        unit = MetricUnit.custom
        target = int(round(target_number))
        unit_hint = "ml"
    elif raw_unit in {"kilogram", "kilograms", "kg"}:
        unit = MetricUnit.custom
        target = int(round(target_number * 1000))
        unit_hint = "g"
    elif raw_unit in {"gram", "grams", "g"}:
        unit = MetricUnit.custom
        target = int(round(target_number))
        unit_hint = "g"
    elif raw_unit in {"kilometer", "kilometers", "km"}:
        unit = MetricUnit.custom
        target = int(round(target_number * 1000))
        unit_hint = "m"
    elif raw_unit in {"meter", "meters", "m"}:
        unit = MetricUnit.custom
        target = int(round(target_number))
        unit_hint = "m"
    elif raw_unit == "custom":
        habit_signal_text = f"{metric_name.lower()} {_habit_text(name=habit_name, description=habit_description)}"
        unit = MetricUnit.custom
        target = int(round(target_number))
        if _contains_any(habit_signal_text, _VOLUME_EVIDENCE_KEYWORDS):
            unit_hint = "ml"
            liters_signal = (
                "liter" in habit_signal_text
                or "litre" in habit_signal_text
                or re.search(r"\d(?:\.\d+)?\s*l\b", habit_signal_text) is not None
            )
            if liters_signal and "ml" not in habit_signal_text and target_number <= 20:
                target = int(round(target_number * 1000))
        elif _contains_any(habit_signal_text, _DISTANCE_EVIDENCE_KEYWORDS):
            unit_hint = "m"
            km_signal = (
                "kilometer" in habit_signal_text
                or "kilometre" in habit_signal_text
                or re.search(r"\d(?:\.\d+)?\s*km\b", habit_signal_text) is not None
            )
            if km_signal and target_number <= 100:
                target = int(round(target_number * 1000))
        elif _contains_any(habit_signal_text, _WEIGHT_EVIDENCE_KEYWORDS):
            unit_hint = "g"
            kg_signal = (
                "kilogram" in habit_signal_text
                or re.search(r"\d(?:\.\d+)?\s*kg\b", habit_signal_text) is not None
            )
            if kg_signal and target_number <= 100:
                target = int(round(target_number * 1000))
    else:
        return None

    if target <= 0:
        return None

    metric_key = _safe_metric_key(habit_id=habit_id, metric_name=metric_name, unit_hint=unit_hint)
    recommendation = _NormalizedRecommendation(
        metric_name=metric_name,
        metric_key=metric_key,
        unit=unit,
        target=target,
        unit_hint=unit_hint,
        rationale=_normalise_rationale(payload.rationale),
    )

    if not _is_recommendation_consistent_with_habit(
        recommendation,
        habit_name=habit_name,
        habit_description=habit_description,
        frequencies=frequencies,
    ):
        return None

    return recommendation


def _parse_stored_recommendation(row: Notification) -> _StoredRecommendation | None:
    data = _parse_json(row.body or "")
    if data is None:
        return None
    try:
        payload = _StoredRecommendation.model_validate(data)
    except ValidationError:
        return None
    if payload.schema_version != _RECOMMENDATION_SCHEMA:
        return None
    return payload


def _to_read(
    row: Notification,
    payload: _StoredRecommendation,
    *,
    habit: RepetitiveTask,
) -> ProgressCoachRecommendationRead:
    return ProgressCoachRecommendationRead(
        id=row.id,
        habit_id=payload.habit_id,
        habit_name=payload.habit_name,
        metric_name=payload.metric_name,
        metric_key=payload.metric_key,
        unit=payload.unit,
        time_span=_recommendation_time_span_for_frequencies(list(habit.frequencies)),
        target=payload.target,
        unit_hint=payload.unit_hint,
        rationale=payload.rationale,
        created_at=row.created_at,
    )


def _stored_recommendation_is_still_valid(
    payload: _StoredRecommendation,
    habit: RepetitiveTask,
) -> bool:
    return _is_recommendation_consistent_with_habit(
        _NormalizedRecommendation(
            metric_name=payload.metric_name,
            metric_key=payload.metric_key,
            unit=payload.unit,
            target=payload.target,
            unit_hint=payload.unit_hint,
            rationale=payload.rationale,
        ),
        habit_name=habit.name,
        habit_description=habit.description,
        frequencies=list(habit.frequencies),
    )


def refresh_for_habit(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    habit_id: int,
) -> None:
    """Refresh the pending recommendation for a habit after create/update.

    This function is intentionally best-effort and should not raise to callers.
    """
    habit = get_owned_or_404(db, RepetitiveTask, habit_id, user.id, name="Repetitive task")

    # If the habit is already connected to an active metric, keep it unchanged
    # and remove any stale pending recommendation.
    if _has_active_linked_metric(db, habit.id):
        _clear_pending_recommendation_for_habit(db, user.id, habit.id)
        db.commit()
        return

    if not _is_habit_quantifiable_candidate(
        habit_name=habit.name,
        habit_description=habit.description,
        frequencies=list(habit.frequencies),
    ):
        _clear_pending_recommendation_for_habit(db, user.id, habit.id)
        db.commit()
        return

    goal_titles = _goal_titles_for_habit(db, habit.id)
    metric_labels = _linked_metric_labels_for_habit(db, habit.id)
    goal_summary = ", ".join(goal_titles) if goal_titles else "none"
    linked_metric_summary = ", ".join(metric_labels) if metric_labels else "none"
    frequency_summary = ", ".join(habit.frequencies)
    habit_summary = (
        f"Habit id: {habit.id}\n"
        f"Habit name: {habit.name}\n"
        f"Description: {habit.description or 'none'}\n"
        f"Priority: {habit.priority.value}\n"
        f"Frequencies: {frequency_summary}\n"
        f"Linked goals: {goal_summary}\n"
        f"Linked metrics: {linked_metric_summary}"
    )

    raw = recommend_progress_metric_json(
        provider,
        habit_summary=habit_summary,
        user_context="",
    )
    parsed = _parse_json(raw)
    if parsed is None:
        repaired = repair_progress_metric_json(
            provider,
            habit_summary=habit_summary,
            malformed_output=raw,
            user_context="",
        )
        parsed = _parse_json(repaired)

    if parsed is None:
        logger.warning(
            "Progress Coach recommendation parse failed for user_id=%s habit_id=%s",
            user.id,
            habit.id,
        )
        _clear_pending_recommendation_for_habit(db, user.id, habit.id)
        db.commit()
        return

    try:
        extracted = _ExtractorRecommendation.model_validate(parsed)
    except ValidationError:
        repaired = repair_progress_metric_json(
            provider,
            habit_summary=habit_summary,
            malformed_output=json.dumps(parsed, ensure_ascii=True),
            user_context="",
        )
        repaired_parsed = _parse_json(repaired)
        if repaired_parsed is not None:
            try:
                extracted = _ExtractorRecommendation.model_validate(repaired_parsed)
            except ValidationError:
                extracted = None
        else:
            extracted = None

    if extracted is None:
        logger.warning(
            "Progress Coach recommendation schema invalid for user_id=%s habit_id=%s",
            user.id,
            habit.id,
        )
        _clear_pending_recommendation_for_habit(db, user.id, habit.id)
        db.commit()
        return

    normalized = _normalise_extractor_output(
        extracted,
        habit_id=habit.id,
        habit_name=habit.name,
        habit_description=habit.description,
        frequencies=list(habit.frequencies),
    )
    _clear_pending_recommendation_for_habit(db, user.id, habit.id)

    if normalized is None:
        db.commit()
        return

    payload = _StoredRecommendation(
        schema=_RECOMMENDATION_SCHEMA,
        habit_id=habit.id,
        habit_name=habit.name,
        metric_name=normalized.metric_name,
        metric_key=normalized.metric_key,
        unit=normalized.unit,
        target=normalized.target,
        unit_hint=normalized.unit_hint,
        rationale=normalized.rationale,
    )
    db.add(
        Notification(
            user_id=user.id,
            title=_title_for_habit(habit.id),
            body=json.dumps(payload.model_dump(mode="json", by_alias=True), ensure_ascii=True),
            type=NotificationType.system,
            sent=True,
            read=True,
        )
    )
    db.commit()


def list_pending(db: Session, user: User) -> list[ProgressCoachRecommendationRead]:
    rows = list(
        db.scalars(
            select(Notification)
            .where(
                Notification.user_id == user.id,
                Notification.title.startswith(INTERNAL_PROGRESS_COACH_TITLE_PREFIX),
            )
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        )
    )
    if not rows:
        return []

    payload_by_id: dict[int, _StoredRecommendation] = {}
    habit_ids: set[int] = set()
    for row in rows:
        payload = _parse_stored_recommendation(row)
        if payload is None:
            continue
        payload_by_id[row.id] = payload
        habit_ids.add(payload.habit_id)

    if not payload_by_id:
        return []

    owned_habits = list(
        db.scalars(
            select(RepetitiveTask).where(
                RepetitiveTask.user_id == user.id,
                RepetitiveTask.id.in_(habit_ids),
            )
        )
    )
    habit_by_id = {habit.id: habit for habit in owned_habits}

    recommendations: list[ProgressCoachRecommendationRead] = []
    stale_recommendation_ids: list[int] = []
    for row in rows:
        payload = payload_by_id.get(row.id)
        if payload is None:
            continue
        habit = habit_by_id.get(payload.habit_id)
        if habit is None:
            continue
        if not _stored_recommendation_is_still_valid(payload, habit):
            stale_recommendation_ids.append(row.id)
            continue
        recommendations.append(_to_read(row, payload, habit=habit))

    if stale_recommendation_ids:
        db.execute(
            delete(Notification).where(
                Notification.user_id == user.id,
                Notification.id.in_(stale_recommendation_ids),
            )
        )
        db.commit()

    return recommendations


def accept_pending(
    db: Session,
    user: User,
    *,
    recommendation_id: int,
) -> ProgressCoachRecommendationAcceptResponse:
    row = get_owned_or_404(
        db,
        Notification,
        recommendation_id,
        user.id,
        name="Progress Coach recommendation",
    )
    if not row.title.startswith(INTERNAL_PROGRESS_COACH_TITLE_PREFIX):
        raise NotFoundError("Progress Coach recommendation not found")

    payload = _parse_stored_recommendation(row)
    if payload is None:
        raise NotFoundError("Progress Coach recommendation not found")

    habit = get_owned_or_404(db, RepetitiveTask, payload.habit_id, user.id, name="Repetitive task")
    recommendation_time_span = _recommendation_time_span_for_frequencies(list(habit.frequencies))

    metric = db.scalar(
        select(TrackedMetric).where(
            TrackedMetric.user_id == user.id,
            TrackedMetric.key == payload.metric_key,
        )
    )
    if metric is None:
        metric = metric_service.create_metric(
            db,
            user,
            MetricCreate(
                key=payload.metric_key,
                label=payload.metric_name,
                unit=payload.unit,
                unit_text=(payload.unit_hint or payload.unit.value),
                time_span=recommendation_time_span,
                target=payload.target,
                linked_habit_ids=[habit.id],
            ),
        )
    else:
        updates: dict[str, Any] = {}
        if metric.label != payload.metric_name:
            updates["label"] = payload.metric_name
        if metric.unit != payload.unit:
            updates["unit"] = payload.unit
        expected_unit_text = payload.unit_hint or payload.unit.value
        if (metric.unit_text or "").lower() != expected_unit_text.lower():
            updates["unit_text"] = expected_unit_text
        if metric.time_span != recommendation_time_span:
            updates["time_span"] = recommendation_time_span
        if metric.target != payload.target:
            updates["target"] = payload.target
        if not metric.active:
            updates["active"] = True
        if updates:
            metric = metric_service.update_metric(
                db,
                user,
                metric.id,
                MetricUpdate(**updates),
            )

    link = db.scalar(
        select(RepetitiveTaskMetricLink).where(
            RepetitiveTaskMetricLink.repetitive_task_id == habit.id,
            RepetitiveTaskMetricLink.metric_id == metric.id,
        )
    )
    if link is None:
        db.add(
            RepetitiveTaskMetricLink(
                repetitive_task_id=habit.id,
                metric_id=metric.id,
            )
        )

    _clear_pending_recommendation_for_habit(db, user.id, habit.id)
    db.commit()

    return ProgressCoachRecommendationAcceptResponse(
        recommendation_id=recommendation_id,
        habit_id=habit.id,
        metric=MetricRead.model_validate(metric),
    )
