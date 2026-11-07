"""Tools for the user's plan: what is on a day, how the recent days went, and what is coming up.

Read only. A day's plan is read through the planner, which is what opens the Plan page, so asking for today builds today's items if
nothing has opened the day yet. Days ahead are previewed from the recurring plans without creating anything.
"""

from collections import defaultdict
from datetime import timedelta
from statistics import mean

from sqlalchemy import select

from app.common import today_ist
from app.llm.tools.common import (
    MAX_AHEAD_DAYS,
    MAX_BACK_DAYS,
    optional_date,
    optional_int,
    safe_tool,
    time_text,
    tool_definition,
    trim,
    weekday_name,
    day_from,
)
from app.llm.tools.context import ToolContext
from app.models.goal import GoalDBM
from app.services import plan_insights_service as insights
from app.services.workout_calc_service import clamp_int

MAX_PLAN_ITEMS = 40
MAX_HISTORY_DAYS = 60
DEFAULT_HISTORY_DAYS = 14
MAX_LISTED_DAYS = 31  # a longer window still gets every figure, but only its last month day by day
MAX_UPCOMING_DAYS = 60
DEFAULT_UPCOMING_DAYS = 14
MAX_UPCOMING_ITEMS = 40

_SOURCE_LABEL = {"habit": "habit", "task": "goal task", "schedule": "scheduled task"}
_PRIORITY_ORDER = {"highest": 0, "high": 1, "medium": 2, "low": 3, "lowest": 4}
_TIME_ORDER = {"morning": 0, "afternoon": 1, "evening": 2, "night": 3}
_TREND_MARGIN = 8  # points between the two halves of a window before it is called a trend


def _progress_text(planner_type: str, value: int, target: int | None, unit: str | None) -> str | None:
    if planner_type != "metric" or not target:
        return None
    return f"{value}/{target}{f' {unit}' if unit else ''}"


def _item_row(item) -> dict:
    saved = item.saved_data
    status = "skipped" if saved and saved.skipped else (saved.status if saved else "due")
    row: dict = {"title": item.title, "type": _SOURCE_LABEL.get(item.source_type, item.source_type), "status": status, "priority": item.priority}
    if when := time_text(item.preferred_time, item.specific_time):
        row["time"] = when
    if progress := _progress_text(item.planner_type, saved.current_value if saved else 0, item.planner_target, item.value_unit):
        row["progress"] = progress
    if item.duration_minutes:
        row["minutes"] = item.duration_minutes
    if item.goal:
        row["goal"] = item.goal.title
    if saved:
        if item.source_type == "habit" and saved.current_streak:
            row["streak_days"] = saved.current_streak
        if saved.note:
            row["note"] = trim(saved.note, 160)
    return row


def _preview(context: ToolContext, day, result: dict) -> dict:
    """A day that has not come yet: the recurring plans that apply, and the scheduled items dated on it. No record is created."""
    from app.services import planner_service, schedule_service  # prevent circular import

    db, user = context.db, context.current_user
    plans = [p for p in planner_service.plans_on(db, user.id, day) if p.source_type != "schedule"]
    goal_ids = insights.goal_ids_by_source(db, user.id, [(p.source_type, p.source_id) for p in plans])
    titles = dict(db.execute(select(GoalDBM.id, GoalDBM.title).where(GoalDBM.user_id == user.id, GoalDBM.id.in_(set(goal_ids.values())))).all()) if goal_ids else {}
    rows = []
    for plan in plans[:MAX_PLAN_ITEMS]:
        row: dict = {"title": plan.title, "type": _SOURCE_LABEL.get(plan.source_type, plan.source_type), "status": "planned", "priority": plan.priority}
        if when := time_text(plan.preferred_time, plan.specific_time):
            row["time"] = when
        if progress := _progress_text(plan.planner_type, 0, plan.planner_target, plan.value_unit):
            row["target"] = progress
        if plan.duration_minutes:
            row["minutes"] = plan.duration_minutes
        if (goal_id := goal_ids.get((plan.source_type, plan.source_id))) and goal_id in titles:
            row["goal"] = titles[goal_id]
        rows.append(row)
    scheduled = [t for t in schedule_service.get_upcoming(db, user, days=(day - today_ist()).days) if t.scheduled_date == day]
    for task in sorted(scheduled, key=lambda t: (_PRIORITY_ORDER.get(t.priority, 99), _TIME_ORDER.get(t.preferred_time, 99), t.id)):
        row = {"title": task.title, "type": "scheduled task", "status": "planned", "priority": task.priority}
        if when := time_text(task.preferred_time, task.specific_time):
            row["time"] = when
        if task.goal:
            row["goal"] = task.goal.title
        rows.append(row)
    result.update({
        "is_preview": True,
        "note": "This day has not come yet, so this is what the recurring plans and scheduled items put on it. Nothing is done or missed yet.",
        "items": rows[:MAX_PLAN_ITEMS],
        "item_count": len(rows),
    })
    return result


@safe_tool
def get_daily_plan(context: ToolContext, arguments: dict) -> dict:
    from app.services import planner_service  # prevent circular import

    db, user = context.db, context.current_user
    today = today_ist()
    day = day_from(arguments, max_back=MAX_BACK_DAYS, max_ahead=MAX_AHEAD_DAYS)
    result: dict = {"today": today.isoformat(), "date": day.isoformat(), "weekday": weekday_name(day)}
    if day > today:
        return _preview(context, day, result)

    plan = planner_service.get_plans_for_date(db, user, day)
    if plan.no_plan_generated:
        result.update({"items": [], "item_count": 0, "note": "Nothing was recorded for that day: the plan was never opened."})
        return result
    rows = [_item_row(item) for item in plan.items]
    counts = {"done": 0, "missed": 0, "skipped": 0, "still_to_do": 0}
    for row in rows:
        counts["still_to_do" if row["status"] == "due" else row["status"]] += 1
    result.update({"summary": {"total": len(rows), **counts}, "items": rows[:MAX_PLAN_ITEMS], "item_count": len(rows)})
    if len(rows) > MAX_PLAN_ITEMS:
        result["note"] = f"Only the first {MAX_PLAN_ITEMS} items are listed, most important first."
    if plan.subtasks:
        result["subtasks"] = [{"of": s.task_title, "what": trim(s.description, 120), "as": s.planner_mode} for s in plan.subtasks]
    if plan.banner_tasks:
        result["long_running"] = [f"{t.title} (until {t.end_date})" if t.end_date else t.title for t in plan.banner_tasks]
    return result


@safe_tool
def get_plan_history(context: ToolContext, arguments: dict) -> dict:
    db, user = context.db, context.current_user
    today = today_ist()
    days = clamp_int(arguments.get("days"), 3, MAX_HISTORY_DAYS, DEFAULT_HISTORY_DAYS)
    start = today - timedelta(days=days - 1)
    scores = insights.daily_scores(db, user, start, today)
    records = insights.records_between(db, user.id, start, today)
    result: dict = {"today": today.isoformat(), "from": start.isoformat(), "to": today.isoformat(), "days_requested": days}
    if not records:
        result["message"] = "Nothing was planned in this period."
        return result

    settled = [d for d in scores if d.date < today and d.score is not None]  # today is still moving, so it joins no average
    result["days_with_a_plan"] = len(scores)
    if settled:
        ranked = sorted(settled, key=lambda d: d.score)
        result["average_score_pct"] = round(mean(d.score for d in settled))
        result["best_day"] = {"date": ranked[-1].date.isoformat(), "weekday": weekday_name(ranked[-1].date), "score": ranked[-1].score}
        result["weakest_day"] = {"date": ranked[0].date.isoformat(), "weekday": weekday_name(ranked[0].date), "score": ranked[0].score}
        if len(settled) >= 6:
            half = len(settled) // 2
            change = mean(d.score for d in settled[half:]) - mean(d.score for d in settled[:half])
            result["trend"] = "improving" if change >= _TREND_MARGIN else "slipping" if change <= -_TREND_MARGIN else "steady"
        if days >= 14:
            by_weekday: dict[str, list[int]] = defaultdict(list)
            for d in settled:
                by_weekday[weekday_name(d.date)].append(d.score)
            result["average_score_by_weekday"] = {name: round(mean(values)) for name, values in by_weekday.items() if len(values) >= 2}
    counts = insights.totals(records, today)
    result["totals"] = {**counts, "completion": insights.percent_text(counts["done"], counts["done"] + counts["missed"])}
    result["days"] = [
        {
            "date": d.date.isoformat(),
            "weekday": weekday_name(d.date)[:3],
            "score": d.score,
            "habits": f"{d.habits_done}/{d.habits_total}",
            "tasks": f"{d.tasks_done}/{d.tasks_total}",
            "scheduled": f"{d.schedule_done}/{d.schedule_total}",
            **({"day_not_over": True} if d.date == today else {}),
        }
        for d in scores[-MAX_LISTED_DAYS:]
    ]

    tallies = insights.tally(records, today, by_title=True)
    missed = sorted((t for t in tallies if t.missed >= 2), key=lambda t: (-t.missed, t.title))[:6]
    result["most_missed"] = [{"title": t.title, "type": _SOURCE_LABEL.get(t.source_type), "missed": t.missed, "out_of": t.planned} for t in missed]
    steady = sorted((t for t in tallies if t.planned >= 4 and (t.rate or 0) >= 80), key=lambda t: (-(t.rate or 0), -t.planned))[:4]
    result["most_consistent"] = [{"title": t.title, "done": t.done, "out_of": t.planned} for t in steady]
    result["note"] = "Skipped items are excused and left out. Today is still open, so it is not counted in the average or as missed."
    return result


def _upcoming_row(task, today) -> dict:
    row: dict = {
        "id": task.id,
        "title": task.title,
        "date": task.scheduled_date.isoformat(),
        "weekday": weekday_name(task.scheduled_date),
        "in_days": (task.scheduled_date - today).days,
        "priority": task.priority,
    }
    if when := time_text(task.preferred_time, task.specific_time):
        row["time"] = when
    if task.repeat_yearly:
        row["repeats_every_year"] = True
    if task.task_duration == "long" and task.end_date:
        row["until"] = task.end_date.isoformat()
    if task.goal:
        row["goal"] = task.goal.title
    if note := trim(task.note, 120):
        row["note"] = note
    if task.subtasks:
        row["subtasks"] = len(task.subtasks)
    return row


@safe_tool
def get_upcoming_schedule(context: ToolContext, arguments: dict) -> dict:
    from app.services import schedule_service  # prevent circular import

    today = today_ist()
    days = clamp_int(arguments.get("days"), 1, MAX_UPCOMING_DAYS, DEFAULT_UPCOMING_DAYS)
    tasks = schedule_service.get_upcoming(context.db, context.current_user, days=days)
    result: dict = {
        "today": today.isoformat(),
        "weekday": weekday_name(today),
        "next_days": days,
        "count": len(tasks),
        "items": [_upcoming_row(t, today) for t in tasks[:MAX_UPCOMING_ITEMS]],
    }
    if not tasks:
        result["message"] = "Nothing is scheduled in this period."
    elif len(tasks) > MAX_UPCOMING_ITEMS:
        result["note"] = f"Only the first {MAX_UPCOMING_ITEMS} are listed, soonest first."
    result["note_on_scope"] = "One-off scheduled tasks and yearly dates only. Habits and goal tasks repeat on their own: use the daily plan for a day to see them."
    return result


_DAY_ARGUMENTS = {
    "date": optional_date("The day as YYYY-MM-DD when the user gave a calendar date. Otherwise null."),
    "days_from_today": optional_int(
        "Days from today: 0 today, -1 yesterday, 1 tomorrow, up to 14 ahead and 90 back. Use it for a relative day and null when you gave a date. "
        "Null for both is today.",
        -MAX_BACK_DAYS,
        MAX_AHEAD_DAYS,
    ),
}

TOOL_DEFINITIONS: dict[str, dict] = {
    "get_daily_plan": tool_definition(
        "get_daily_plan",
        "The user's plan for one day: every habit, goal task and scheduled task with its status (done, due, missed, skipped), priority, time, "
        "progress, goal and streak, plus sub-tasks. Use it for 'what's on today', 'what did I miss yesterday', 'what do I have tomorrow'. "
        "Days ahead are previewed from the recurring plans.",
        _DAY_ARGUMENTS,
    ),
    "get_plan_history": tool_definition(
        "get_plan_history",
        "How the recent days went against the plan: each day's score and counts, the average, best and weakest day, the trend, the weekday "
        "pattern, the items missed most and the most consistent ones. Use it for 'how am I doing', 'what keeps slipping', 'which days are my worst'.",
        {"days": optional_int(f"How many days back, ending today (3 to {MAX_HISTORY_DAYS}). Null for {DEFAULT_HISTORY_DAYS}.", 3, MAX_HISTORY_DAYS)},
    ),
    "get_upcoming_schedule": tool_definition(
        "get_upcoming_schedule",
        "The user's one-off scheduled tasks and yearly dates (birthdays, renewals) coming up, soonest first, across month boundaries. Use it for "
        "'what's coming up', 'anything due this week' or before suggesting a day for something.",
        {"days": optional_int(f"How many days ahead (1 to {MAX_UPCOMING_DAYS}). Null for {DEFAULT_UPCOMING_DAYS}.", 1, MAX_UPCOMING_DAYS)},
    ),
}

TOOLS = {
    "get_daily_plan": get_daily_plan,
    "get_plan_history": get_plan_history,
    "get_upcoming_schedule": get_upcoming_schedule,
}
