"""Tool for the user's habits: what they are, how long each streak is, and how consistently each one is kept. Read only."""

from datetime import timedelta

from app.common import today_ist
from app.llm.tools.common import safe_tool, time_text, tool_definition, trim, weekday_name
from app.llm.tools.context import ToolContext
from app.services import plan_insights_service as insights

RECENT_WINDOW_DAYS = 30
LONGER_WINDOW_DAYS = 90
RECENT_RECORDS = 21
MAX_HABITS = 40

_DAY_LABELS = {
    "sunday": "Sun", "monday": "Mon", "tuesday": "Tue", "wednesday": "Wed", "thursday": "Thu", "friday": "Fri", "saturday": "Sat",
}
_DAY_ORDER = list(_DAY_LABELS)


def _schedule_text(habit) -> str:
    """How often the habit comes up, in the words the person would use."""
    freqs = set(habit.frequencies)
    if "daily" in freqs:
        return "every day"
    parts: list[str] = []
    if "weekdays" in freqs:
        parts.append("weekdays")
    if "weekends" in freqs:
        parts.append("weekends")
    parts.extend(_DAY_LABELS[d] for d in _DAY_ORDER if d in freqs)
    if "weekly" in freqs:
        parts.append(f"{habit.weekly_count} times a week" if habit.weekly_count else "weekly")
    if "monthly" in freqs:
        parts.append(f"{habit.monthly_count} times a month" if habit.monthly_count else "monthly")
    if "first_of_month" in freqs:
        parts.append("first of the month")
    if "end_of_month" in freqs:
        parts.append("end of the month")
    if "specific_day" in freqs and habit.specific_days:
        parts.append("day " + ", ".join(str(d) for d in sorted(habit.specific_days)) + " of the month")
    return ", ".join(parts) or "no schedule"


def _row(habit, window: str | None) -> dict:
    row: dict = {
        "id": habit.id,
        "title": habit.title,
        "schedule": _schedule_text(habit),
        "priority": habit.priority,
        "streak_days": habit.current_streak,
        "best_streak_days": habit.max_streak,
    }
    if habit.status != "active":
        row["status"] = habit.status
    if when := time_text(habit.preferred_time, habit.specific_time):
        row["time"] = when
    if habit.planner_type == "metric" and habit.planner_target:
        row["target"] = f"{habit.planner_target}{f' {habit.value_unit}' if habit.value_unit else ''} each time"
    if habit.duration_minutes:
        row["minutes"] = habit.duration_minutes
    if habit.goal:
        row["goal"] = habit.goal.title
    if window is not None:
        row[f"last_{RECENT_WINDOW_DAYS}_days"] = window
    return row


@safe_tool
def get_habits(context: ToolContext, arguments: dict) -> dict:
    from app.services import habits_service  # prevent circular import

    db, user = context.db, context.current_user
    today = today_ist()
    habit_id = arguments.get("habit_id")
    result: dict = {"today": today.isoformat(), "weekday": weekday_name(today)}

    if habit_id is not None:
        activity = habits_service.get_activity(db, user, habit_id)
        habit = activity.habit
        records = insights.records_between(db, user.id, today - timedelta(days=LONGER_WINDOW_DAYS - 1), today, source_type="habit", source_ids=[habit.id], report_only=False)
        recent = [r for r in records if r.scheduled_date > today - timedelta(days=RECENT_WINDOW_DAYS)]
        counts, longer = insights.totals(recent, today), insights.totals(records, today)
        row = _row(habit, insights.percent_text(counts["done"], counts["done"] + counts["missed"]))
        row[f"last_{LONGER_WINDOW_DAYS}_days"] = insights.percent_text(longer["done"], longer["done"] + longer["missed"])
        row["skipped_last_30_days"] = counts["skipped"]
        if note := trim(habit.note, 200):
            row["note"] = note
        if habit.start_date:
            row["started"] = habit.start_date.isoformat()
        if habit.end_date:
            row["ends"] = habit.end_date.isoformat()
        row["can_skip"] = habit.can_skip
        result["habit"] = row
        result["recent_days"] = [
            {
                "date": r.date.isoformat(),
                "weekday": weekday_name(r.date)[:3],
                "status": "missed" if r.status == "due" and r.date < today else r.status,  # a past day left open is missed, as in the app
                **({"value": r.value} if r.value else {}),
                **({"note": trim(r.note, 100)} if r.note else {}),
            }
            for r in activity.records[:RECENT_RECORDS]
        ]
        return result

    habits = habits_service.get_list(db, user, status=None if arguments.get("include_inactive") else "active")
    window_start = today - timedelta(days=RECENT_WINDOW_DAYS - 1)
    records = insights.records_between(db, user.id, window_start, today, source_type="habit", source_ids=[h.id for h in habits] or None, report_only=False) if habits else []
    tallies = {t.source_id: t for t in insights.tally(records, today)}
    rows = []
    for habit in habits[:MAX_HABITS]:
        tally = tallies.get(habit.id)
        rows.append(_row(habit, insights.percent_text(tally.done, tally.planned) if tally else "nothing due yet"))
    result["count"] = len(habits)
    result["habits"] = rows
    if not habits:
        result["message"] = "The user has no habits yet."
    elif len(habits) > MAX_HABITS:
        result["note"] = f"Only the first {MAX_HABITS} are listed."
    result["note_on_figures"] = f"last_{RECENT_WINDOW_DAYS}_days counts done against missed; skipped days are excused and today is not counted until it is over."
    return result


TOOL_DEFINITIONS: dict[str, dict] = {
    "get_habits": tool_definition(
        "get_habits",
        "The user's habits: schedule, priority, time, goal, current and best streak, and how many of the last 30 days each was kept. Pass a "
        "habit_id for one habit's notes and its last three weeks day by day. Use it for 'how are my habits', 'which streaks am I building', "
        "'why do I keep missing X'.",
        {
            "habit_id": {"type": ["integer", "null"], "minimum": 1, "description": "One habit's id from an earlier result, or null for all of them."},
            "include_inactive": {"type": "boolean", "description": "True to include paused and archived habits as well. Usually false."},
        },
    ),
}

TOOLS = {"get_habits": get_habits}
