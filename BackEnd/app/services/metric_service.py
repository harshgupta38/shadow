"""Tracked-metric & activity-log business logic, plus roll-up summaries."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.enums import ActivitySource, MetricType, MetricUnit
from app.models.metric import TrackedMetric
from app.models.user import User
from app.schemas.activity import ActivityLogCreate
from app.schemas.metric import MetricCreate, MetricUpdate
from app.services.exceptions import ConflictError
from app.services.utils import get_owned_or_404

# Seeded for every new user as sensible starting metrics.
DEFAULT_METRICS: list[dict] = [
    {"key": "deep_work_minutes", "label": "Deep-work time", "unit": MetricUnit.minutes, "target": 180},
    {"key": "tasks_completed", "label": "Tasks completed", "unit": MetricUnit.count, "target": None},
]


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
    return list(db.scalars(stmt.order_by(TrackedMetric.created_at)))


def create_metric(db: Session, user: User, data: MetricCreate) -> TrackedMetric:
    exists = db.scalar(
        select(TrackedMetric).where(
            TrackedMetric.user_id == user.id, TrackedMetric.key == data.key
        )
    )
    if exists is not None:
        raise ConflictError(f"Metric '{data.key}' already exists")
    metric = TrackedMetric(
        user_id=user.id,
        key=data.key,
        label=data.label,
        unit=data.unit,
        type=MetricType.custom,
        target=data.target,
        active=True,
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


def update_metric(db: Session, user: User, metric_id: int, data: MetricUpdate) -> TrackedMetric:
    metric = get_owned_or_404(db, TrackedMetric, metric_id, user.id, name="Metric")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(metric, field, value)
    db.commit()
    db.refresh(metric)
    return metric


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
