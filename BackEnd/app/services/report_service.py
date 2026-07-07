"""Report business logic — roll up metrics + tasks and write an AI narrative."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import generate_report_narrative
from app.llm.base import LLMProvider
from app.memory.context import compile_user_context
from app.models.enums import (
    GoalStatus,
    PlannedTaskStatus,
    ReportPeriod,
    ReportSource,
    RepetitiveTaskStatus,
)
from app.models.goal import Goal
from app.models.planned_task import PlannedTask
from app.models.repetitive_task import RepetitiveTask
from app.models.report import Report
from app.models.user_setting import UserSetting
from app.models.user import User
from app.models.metric import TrackedMetric
from app.schemas.report import ReportAutomationRead, ReportAutomationUpdate
from app.services import metric_service, settings_service
from app.services.utils import get_owned_or_404


_AUTOMATION_WEEKDAY_TO_INDEX = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}
_DEFAULT_AUTOMATION_WEEKDAY = "saturday"
_DEFAULT_AUTOMATION_TIME = "23:55"
_HHMM_PATTERN = re.compile(r"^\d{2}:\d{2}$")


def _default_snapshot_config() -> dict:
    return {
        "include_plan_snapshot": True,
        "include_goals_snapshot": True,
        "include_habits_snapshot": True,
        "include_metrics_snapshot": True,
        "include_missed_tasks_snapshot": True,
        "include_streaks_snapshot": True,
        "selected_metric_ids": [],
        "selected_habit_ids": [],
    }


def _sanitize_hhmm(value: str | None, *, fallback: str) -> str:
    if not value:
        return fallback
    candidate = value.strip()
    if not _HHMM_PATTERN.fullmatch(candidate):
        return fallback
    hour = int(candidate[:2])
    minute = int(candidate[3:])
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return fallback
    return f"{hour:02d}:{minute:02d}"


def _sanitize_weekday(value: str | None) -> str:
    candidate = (value or "").strip().lower()
    if candidate in _AUTOMATION_WEEKDAY_TO_INDEX:
        return candidate
    return _DEFAULT_AUTOMATION_WEEKDAY


def _parse_id_csv(raw: str | None) -> list[int]:
    if not raw:
        return []
    values: list[int] = []
    seen: set[int] = set()
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        try:
            parsed = int(token)
        except ValueError:
            continue
        if parsed <= 0 or parsed in seen:
            continue
        values.append(parsed)
        seen.add(parsed)
    return values


def _to_id_csv(values: list[int]) -> str:
    return ",".join(str(value) for value in values)


def _sanitize_selected_ids(values: list[int] | None) -> list[int]:
    if not values:
        return []
    output: list[int] = []
    seen: set[int] = set()
    for raw in values:
        try:
            parsed = int(raw)
        except (TypeError, ValueError):
            continue
        if parsed <= 0 or parsed in seen:
            continue
        output.append(parsed)
        seen.add(parsed)
    return output


def _owned_metric_ids(db: Session, user: User, ids: list[int]) -> list[int]:
    if not ids:
        return []
    owned_ids = set(
        db.scalars(
            select(TrackedMetric.id).where(
                TrackedMetric.user_id == user.id,
                TrackedMetric.active.is_(True),
                TrackedMetric.id.in_(ids),
            )
        )
    )
    return [value for value in ids if value in owned_ids]


def _owned_habit_ids(db: Session, user: User, ids: list[int]) -> list[int]:
    if not ids:
        return []
    owned_ids = set(
        db.scalars(
            select(RepetitiveTask.id).where(
                RepetitiveTask.user_id == user.id,
                RepetitiveTask.status != RepetitiveTaskStatus.archived,
                RepetitiveTask.id.in_(ids),
            )
        )
    )
    return [value for value in ids if value in owned_ids]


def _snapshot_config_from_settings(
    db: Session,
    user: User,
    settings: UserSetting,
) -> dict:
    selected_metric_ids = _owned_metric_ids(
        db,
        user,
        _parse_id_csv(settings.report_snapshot_metric_ids_csv),
    )
    selected_habit_ids = _owned_habit_ids(
        db,
        user,
        _parse_id_csv(settings.report_snapshot_habit_ids_csv),
    )
    return {
        "include_plan_snapshot": settings.report_snapshot_include_plan,
        "include_goals_snapshot": settings.report_snapshot_include_goals,
        "include_habits_snapshot": settings.report_snapshot_include_habits,
        "include_metrics_snapshot": settings.report_snapshot_include_metrics,
        "include_missed_tasks_snapshot": settings.report_snapshot_include_missed_tasks,
        "include_streaks_snapshot": settings.report_snapshot_include_streaks,
        "selected_metric_ids": selected_metric_ids,
        "selected_habit_ids": selected_habit_ids,
    }


def _period_bounds(period: ReportPeriod, on_date: date) -> tuple[date, date]:
    if period == ReportPeriod.weekly:
        start = on_date - timedelta(days=on_date.weekday())  # Monday
        return start, start + timedelta(days=6)
    return on_date, on_date


def _to_dt(day: date, *, end: bool = False) -> datetime:
    return datetime.combine(day, time.max if end else time.min, tzinfo=timezone.utc)


def _safe_timezone(name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _created_history_date(created_at: datetime, timezone_name: str) -> date:
    tz = _safe_timezone(timezone_name)
    return _as_utc(created_at).astimezone(tz).date()


def _period_history_date(report: Report) -> date:
    if report.period == ReportPeriod.weekly:
        return _as_utc(report.period_end).date()
    return _as_utc(report.period_start).date()


def _report_history_date(report: Report, timezone_name: str) -> date:
    # Automatic reports should stay anchored to the report's target period date,
    # even if generation completes after local midnight.
    if report.source == ReportSource.automatic:
        return _period_history_date(report)
    return _created_history_date(report.created_at, timezone_name)


def _narrative_snippet(text: str | None, *, limit: int = 180) -> str | None:
    if not text:
        return None
    normalized = " ".join(part.strip() for part in text.splitlines() if part.strip())
    if not normalized:
        return None
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 1].rstrip()}…"


def _build_report_automation_payload(
    db: Session,
    user: User,
    settings: UserSetting,
) -> ReportAutomationRead:
    snapshot_config = _snapshot_config_from_settings(db, user, settings)
    return ReportAutomationRead(
        enabled=settings.report_automation_enabled,
        daily_enabled=settings.report_automation_daily_enabled,
        daily_time=_sanitize_hhmm(
            settings.report_automation_daily_time,
            fallback=_DEFAULT_AUTOMATION_TIME,
        ),
        weekly_enabled=settings.report_automation_weekly_enabled,
        weekly_day=_sanitize_weekday(settings.report_automation_weekly_day),
        weekly_time=_sanitize_hhmm(
            settings.report_automation_weekly_time,
            fallback=_DEFAULT_AUTOMATION_TIME,
        ),
        include_plan_snapshot=snapshot_config["include_plan_snapshot"],
        include_goals_snapshot=snapshot_config["include_goals_snapshot"],
        include_habits_snapshot=snapshot_config["include_habits_snapshot"],
        include_metrics_snapshot=snapshot_config["include_metrics_snapshot"],
        include_missed_tasks_snapshot=snapshot_config["include_missed_tasks_snapshot"],
        include_streaks_snapshot=snapshot_config["include_streaks_snapshot"],
        selected_metric_ids=snapshot_config["selected_metric_ids"],
        selected_habit_ids=snapshot_config["selected_habit_ids"],
    )


def get_report_automation(db: Session, user: User) -> ReportAutomationRead:
    settings = settings_service.get_user_settings_row(db, user)
    return _build_report_automation_payload(db, user, settings)


def get_report_automation_schedule(db: Session, user: User) -> dict[str, str | bool]:
    settings = settings_service.get_user_settings_row(db, user)
    return {
        "enabled": settings.report_automation_enabled,
        "daily_enabled": settings.report_automation_daily_enabled,
        "daily_time": _sanitize_hhmm(
            settings.report_automation_daily_time,
            fallback=_DEFAULT_AUTOMATION_TIME,
        ),
        "weekly_enabled": settings.report_automation_weekly_enabled,
        "weekly_day": _sanitize_weekday(settings.report_automation_weekly_day),
        "weekly_time": _sanitize_hhmm(
            settings.report_automation_weekly_time,
            fallback=_DEFAULT_AUTOMATION_TIME,
        ),
    }


def update_report_automation(
    db: Session,
    user: User,
    data: ReportAutomationUpdate,
) -> ReportAutomationRead:
    settings = settings_service.get_user_settings_row(db, user)
    updates = data.model_dump(exclude_unset=True)

    if "enabled" in updates:
        settings.report_automation_enabled = bool(updates["enabled"])
    if "daily_enabled" in updates:
        settings.report_automation_daily_enabled = bool(updates["daily_enabled"])
    if "daily_time" in updates:
        settings.report_automation_daily_time = _sanitize_hhmm(
            updates["daily_time"],
            fallback=settings.report_automation_daily_time,
        )
    if "weekly_enabled" in updates:
        settings.report_automation_weekly_enabled = bool(updates["weekly_enabled"])
    if "weekly_day" in updates:
        settings.report_automation_weekly_day = _sanitize_weekday(updates["weekly_day"])
    if "weekly_time" in updates:
        settings.report_automation_weekly_time = _sanitize_hhmm(
            updates["weekly_time"],
            fallback=settings.report_automation_weekly_time,
        )
    if "include_plan_snapshot" in updates:
        settings.report_snapshot_include_plan = bool(updates["include_plan_snapshot"])
    if "include_goals_snapshot" in updates:
        settings.report_snapshot_include_goals = bool(updates["include_goals_snapshot"])
    if "include_habits_snapshot" in updates:
        settings.report_snapshot_include_habits = bool(updates["include_habits_snapshot"])
    if "include_metrics_snapshot" in updates:
        settings.report_snapshot_include_metrics = bool(updates["include_metrics_snapshot"])
    if "include_missed_tasks_snapshot" in updates:
        settings.report_snapshot_include_missed_tasks = bool(updates["include_missed_tasks_snapshot"])
    if "include_streaks_snapshot" in updates:
        settings.report_snapshot_include_streaks = bool(updates["include_streaks_snapshot"])

    if "selected_metric_ids" in updates:
        selected_metric_ids = _owned_metric_ids(
            db,
            user,
            _sanitize_selected_ids(updates["selected_metric_ids"]),
        )
        settings.report_snapshot_metric_ids_csv = _to_id_csv(selected_metric_ids)

    if "selected_habit_ids" in updates:
        selected_habit_ids = _owned_habit_ids(
            db,
            user,
            _sanitize_selected_ids(updates["selected_habit_ids"]),
        )
        settings.report_snapshot_habit_ids_csv = _to_id_csv(selected_habit_ids)

    db.commit()
    db.refresh(settings)
    return _build_report_automation_payload(db, user, settings)


def _build_metrics_json(
    db: Session,
    user: User,
    start_d: date,
    end_d: date,
    *,
    snapshot_config: dict,
) -> dict:
    tasks = list(
        db.scalars(
            select(PlannedTask).where(
                PlannedTask.user_id == user.id,
                PlannedTask.date >= start_d,
                PlannedTask.date <= end_d,
            )
        )
    )
    planned_count = len(tasks)
    completed_count = sum(1 for task in tasks if task.status == PlannedTaskStatus.done)
    missed_count = sum(1 for task in tasks if task.status == PlannedTaskStatus.missed)

    selected_metric_ids = set(snapshot_config["selected_metric_ids"])
    selected_habit_ids = set(snapshot_config["selected_habit_ids"])

    metrics = metric_service.list_metrics(db, user)
    if selected_metric_ids:
        metrics = [metric for metric in metrics if metric.id in selected_metric_ids]

    metric_rows_full = [
        {
            "metric_id": metric.id,
            "key": metric.key,
            "label": metric.label,
            "unit": metric.unit.value,
            "total": metric_service.sum_between(db, metric.id, start_d, end_d),
            "target": metric.target,
            "streak_days": metric_service.compute_streak(db, metric.id, today=end_d),
        }
        for metric in metrics
    ]

    metric_rows = metric_rows_full if snapshot_config["include_metrics_snapshot"] else []

    goals_payload = {
        "included": snapshot_config["include_goals_snapshot"],
        "active_count": 0,
        "completed_count": 0,
        "average_progress": 0,
        "active_goal_titles": [],
    }
    if snapshot_config["include_goals_snapshot"]:
        goals = list(db.scalars(select(Goal).where(Goal.user_id == user.id)))
        active_goals = [goal for goal in goals if goal.status == GoalStatus.active]
        completed_goals = [goal for goal in goals if goal.status == GoalStatus.completed]
        average_progress = (
            round(sum(goal.progress for goal in active_goals) / len(active_goals))
            if active_goals
            else 0
        )
        goals_payload = {
            "included": True,
            "active_count": len(active_goals),
            "completed_count": len(completed_goals),
            "average_progress": average_progress,
            "active_goal_titles": [goal.title for goal in active_goals[:6]],
        }

    habits_payload = {
        "included": snapshot_config["include_habits_snapshot"],
        "tracked_count": 0,
        "active_count": 0,
        "paused_count": 0,
        "habit_items": [],
    }
    if snapshot_config["include_habits_snapshot"]:
        habits_stmt = select(RepetitiveTask).where(
            RepetitiveTask.user_id == user.id,
            RepetitiveTask.status != RepetitiveTaskStatus.archived,
        )
        if selected_habit_ids:
            habits_stmt = habits_stmt.where(RepetitiveTask.id.in_(selected_habit_ids))
        habits = list(db.scalars(habits_stmt.order_by(RepetitiveTask.created_at.desc())))
        active_habits = [habit for habit in habits if habit.status == RepetitiveTaskStatus.active]
        paused_habits = [habit for habit in habits if habit.status == RepetitiveTaskStatus.paused]
        habits_payload = {
            "included": True,
            "tracked_count": len(habits),
            "active_count": len(active_habits),
            "paused_count": len(paused_habits),
            "habit_items": [
                {
                    "id": habit.id,
                    "name": habit.name,
                    "status": habit.status.value,
                    "frequencies": habit.frequencies,
                }
                for habit in habits[:10]
            ],
        }

    streak_payload = {
        "included": snapshot_config["include_streaks_snapshot"],
        "top_metric_streaks": [],
    }
    if snapshot_config["include_streaks_snapshot"]:
        top_streaks = sorted(
            [
                {"label": row["label"], "streak_days": row["streak_days"]}
                for row in metric_rows_full
                if row["streak_days"] > 0
            ],
            key=lambda row: row["streak_days"],
            reverse=True,
        )
        streak_payload = {
            "included": True,
            "top_metric_streaks": top_streaks[:6],
        }

    return {
        "tasks": {
            "included": snapshot_config["include_plan_snapshot"],
            "planned": planned_count if snapshot_config["include_plan_snapshot"] else 0,
            "completed": completed_count if snapshot_config["include_plan_snapshot"] else 0,
            "missed": (
                missed_count
                if snapshot_config["include_plan_snapshot"] and snapshot_config["include_missed_tasks_snapshot"]
                else 0
            ),
        },
        "metrics": metric_rows,
        "goals": goals_payload,
        "habits": habits_payload,
        "streaks": streak_payload,
        "automation_snapshot": {
            "include_plan_snapshot": snapshot_config["include_plan_snapshot"],
            "include_goals_snapshot": snapshot_config["include_goals_snapshot"],
            "include_habits_snapshot": snapshot_config["include_habits_snapshot"],
            "include_metrics_snapshot": snapshot_config["include_metrics_snapshot"],
            "include_missed_tasks_snapshot": snapshot_config["include_missed_tasks_snapshot"],
            "include_streaks_snapshot": snapshot_config["include_streaks_snapshot"],
            "selected_metric_ids": list(snapshot_config["selected_metric_ids"]),
            "selected_habit_ids": list(snapshot_config["selected_habit_ids"]),
        },
    }


def _summary_text(metrics_json: dict, period: ReportPeriod, start_d: date, end_d: date) -> str:
    lines = [f"Period: {period.value} ({start_d} → {end_d})"]
    snapshot = metrics_json.get("automation_snapshot") or {}

    if snapshot:
        lines.append(
            "Snapshot config: "
            f"plan={snapshot.get('include_plan_snapshot')}, "
            f"goals={snapshot.get('include_goals_snapshot')}, "
            f"habits={snapshot.get('include_habits_snapshot')}, "
            f"metrics={snapshot.get('include_metrics_snapshot')}, "
            f"streaks={snapshot.get('include_streaks_snapshot')}."
        )

    tasks = metrics_json.get("tasks") or {}
    if tasks.get("included", True):
        lines.append(
            f"Planned tasks: {tasks.get('completed', 0)}/{tasks.get('planned', 0)} completed."
        )
        if snapshot.get("include_missed_tasks_snapshot", True):
            lines.append(f"Missed tasks: {tasks.get('missed', 0)}.")
    else:
        lines.append("Plan snapshot was disabled for this report.")

    goals = metrics_json.get("goals") or {}
    if goals.get("included"):
        lines.append(
            f"Goals: {goals.get('active_count', 0)} active, "
            f"{goals.get('completed_count', 0)} completed, "
            f"avg active progress {goals.get('average_progress', 0)}%."
        )

    habits = metrics_json.get("habits") or {}
    if habits.get("included"):
        lines.append(
            f"Habits: {habits.get('tracked_count', 0)} tracked "
            f"({habits.get('active_count', 0)} active, {habits.get('paused_count', 0)} paused)."
        )

    metric_rows = metrics_json.get("metrics") or []
    if not metric_rows and snapshot.get("include_metrics_snapshot") is False:
        lines.append("Metric totals snapshot was disabled for this report.")

    for row in metric_rows:
        target = f", target {row['target']}" if row["target"] is not None else ""
        lines.append(
            f"{row['label']}: {row['total']:g} {row['unit']} "
            f"(streak {row['streak_days']}d{target})."
        )

    streaks = metrics_json.get("streaks") or {}
    if streaks.get("included") and streaks.get("top_metric_streaks"):
        top_label = streaks["top_metric_streaks"][0]["label"]
        top_days = streaks["top_metric_streaks"][0]["streak_days"]
        lines.append(f"Top streak: {top_label} ({top_days} days).")

    return "\n".join(lines)


def generate_report(
    db: Session,
    user: User,
    provider: LLMProvider,
    *,
    period: ReportPeriod = ReportPeriod.daily,
    on_date: date | None = None,
    source: ReportSource = ReportSource.manual,
) -> Report:
    on_date = on_date or date.today()
    start_d, end_d = _period_bounds(period, on_date)
    user_settings = settings_service.get_user_settings_row(db, user)

    snapshot_config = (
        _snapshot_config_from_settings(db, user, user_settings)
        if source == ReportSource.automatic
        else _default_snapshot_config()
    )
    metrics_json = _build_metrics_json(
        db,
        user,
        start_d,
        end_d,
        snapshot_config=snapshot_config,
    )
    summary_text = _summary_text(metrics_json, period, start_d, end_d)

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
        source=source,
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


def list_report_history(
    db: Session,
    user: User,
    *,
    period: ReportPeriod | None = None,
) -> list[dict]:
    grouped: dict[date, list[Report]] = {}
    for report in list_reports(db, user, period=period):
        key = _report_history_date(report, user.timezone)
        grouped.setdefault(key, []).append(report)

    cards: list[dict] = []
    for history_date, versions in grouped.items():
        ordered = sorted(versions, key=lambda row: _as_utc(row.created_at))
        latest = ordered[-1]
        cards.append(
            {
                "history_date": history_date,
                "versions_count": len(ordered),
                "latest_report_id": latest.id,
                "latest_period": latest.period,
                "latest_created_at": _as_utc(latest.created_at),
                "latest_narrative_snippet": _narrative_snippet(latest.narrative),
                "report_periods": sorted(
                    {row.period for row in ordered}, key=lambda value: value.value
                ),
            }
        )

    cards.sort(key=lambda row: row["history_date"], reverse=True)
    return cards


def list_report_versions_for_date(
    db: Session,
    user: User,
    history_date: date,
    *,
    period: ReportPeriod | None = None,
) -> list[Report]:
    versions = [
        report
        for report in list_reports(db, user, period=period)
        if _report_history_date(report, user.timezone) == history_date
    ]
    versions.sort(key=lambda row: _as_utc(row.created_at))
    return versions


def get_report(db: Session, user: User, report_id: int) -> Report:
    return get_owned_or_404(db, Report, report_id, user.id, name="Report")


def delete_report(db: Session, user: User, report_id: int) -> None:
    report = get_report(db, user, report_id)
    db.delete(report)
    db.commit()


def automatic_report_exists(
    db: Session,
    user: User,
    *,
    period: ReportPeriod,
    on_date: date,
) -> bool:
    start_d, end_d = _period_bounds(period, on_date)
    existing = db.scalar(
        select(Report.id).where(
            Report.user_id == user.id,
            Report.period == period,
            Report.source == ReportSource.automatic,
            Report.period_start == _to_dt(start_d),
            Report.period_end == _to_dt(end_d, end=True),
        )
    )
    return existing is not None
