"""Report business logic — roll up metrics + tasks and write an AI narrative."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import generate_report_narrative
from app.llm.base import LLMProvider
from app.memory.context import compile_user_context
from app.models.enums import PlannedTaskStatus, ReportPeriod
from app.models.planned_task import PlannedTask
from app.models.report import Report
from app.models.user import User
from app.services import metric_service, settings_service
from app.services.utils import get_owned_or_404


def _period_bounds(period: ReportPeriod, on_date: date) -> tuple[date, date]:
    if period == ReportPeriod.weekly:
        start = on_date - timedelta(days=on_date.weekday())  # Monday
        return start, start + timedelta(days=6)
    return on_date, on_date


def _to_dt(day: date, *, end: bool = False) -> datetime:
    return datetime.combine(day, time.max if end else time.min, tzinfo=timezone.utc)


def _build_metrics_json(db: Session, user: User, start_d: date, end_d: date) -> dict:
    tasks = list(
        db.scalars(
            select(PlannedTask).where(
                PlannedTask.user_id == user.id,
                PlannedTask.date >= start_d,
                PlannedTask.date <= end_d,
            )
        )
    )
    completed = sum(1 for t in tasks if t.status == PlannedTaskStatus.done)

    metric_rows = [
        {
            "key": metric.key,
            "label": metric.label,
            "unit": metric.unit.value,
            "total": metric_service.sum_between(db, metric.id, start_d, end_d),
            "target": metric.target,
            "streak_days": metric_service.compute_streak(db, metric.id, today=end_d),
        }
        for metric in metric_service.list_metrics(db, user)
    ]
    return {
        "tasks": {"planned": len(tasks), "completed": completed},
        "metrics": metric_rows,
    }


def _summary_text(metrics_json: dict, period: ReportPeriod, start_d: date, end_d: date) -> str:
    lines = [f"Period: {period.value} ({start_d} → {end_d})"]
    tasks = metrics_json["tasks"]
    lines.append(f"Planned tasks: {tasks['completed']}/{tasks['planned']} completed.")
    for row in metrics_json["metrics"]:
        target = f", target {row['target']}" if row["target"] is not None else ""
        lines.append(
            f"{row['label']}: {row['total']:g} {row['unit']} "
            f"(streak {row['streak_days']}d{target})."
        )
    return "\n".join(lines)


def generate_report(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    period: ReportPeriod = ReportPeriod.daily,
    on_date: date | None = None,
) -> Report:
    on_date = on_date or date.today()
    start_d, end_d = _period_bounds(period, on_date)
    metrics_json = _build_metrics_json(db, user, start_d, end_d)
    summary_text = _summary_text(metrics_json, period, start_d, end_d)
    user_settings = settings_service.get_user_settings_row(db, user)
    preferred_model = settings_service.resolve_runtime_ai_model(user_settings.ai_default_model)

    narrative, next_steps = generate_report_narrative(
        provider,
        metrics_summary=summary_text,
        user_context=compile_user_context(db, user),
        model=preferred_model,
    )
    if not user_settings.ai_suggestions_enabled:
        next_steps = "Suggestions are disabled in AI behavior settings."

    report = Report(
        user_id=user.id,
        period=period,
        period_start=_to_dt(start_d),
        period_end=_to_dt(end_d, end=True),
        metrics_json=metrics_json,
        narrative=narrative,
        next_steps=next_steps,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def list_reports(db: Session, user: User, *, period: ReportPeriod | None = None) -> list[Report]:
    stmt = select(Report).where(Report.user_id == user.id)
    if period is not None:
        stmt = stmt.where(Report.period == period)
    return list(db.scalars(stmt.order_by(Report.created_at.desc())))


def get_report(db: Session, user: User, report_id: int) -> Report:
    return get_owned_or_404(db, Report, report_id, user.id, name="Report")
