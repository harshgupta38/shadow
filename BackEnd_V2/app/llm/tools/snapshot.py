"""Tool for a quick picture of the user's day across the whole app: plan, goals, report, training, nutrition, what is coming and mood.

One call replaces five or six, which is cheaper for the user's AI allowance and is what a general question ('how am I doing',
'what should I focus on') needs. Each part is read on its own: one that fails is left out, so it never hides the others.
Read only, apart from what opening today's plan already does (see plan.py).
"""

import logging

from app.common import today_ist
from app.llm.tools.common import safe_tool, time_text, tool_definition, weekday_name
from app.llm.tools.context import ToolContext
from app.services import diet_overview_service, journal_service, workout_insights_service

logger = logging.getLogger(__name__)

MAX_NEXT_UP = 5
MAX_STREAKS = 3
MIN_STREAK_DAYS = 3
MAX_GOALS = 6
MAX_COMING_UP = 4
COMING_UP_DAYS = 14
MAX_COUNTDOWNS = 3


def _plan_today(db, user, today) -> dict | None:
    from app.services import planner_service  # prevent circular import

    plan = planner_service.get_plans_for_date(db, user, today)
    if not plan.items:
        return None
    counts = {"done": 0, "skipped": 0, "left": 0}
    next_up: list[str] = []
    for item in plan.items:  # already ordered most important first
        saved = item.saved_data
        if saved and saved.skipped:
            counts["skipped"] += 1
        elif saved and saved.status == "done":
            counts["done"] += 1
        else:
            counts["left"] += 1
            if len(next_up) < MAX_NEXT_UP:
                when = time_text(item.preferred_time, item.specific_time)
                next_up.append(f"{item.title} ({when})" if when else item.title)
    streaks = sorted(
        ((i.title, i.saved_data.current_streak) for i in plan.items if i.source_type == "habit" and i.saved_data and i.saved_data.current_streak >= MIN_STREAK_DAYS),
        key=lambda pair: -pair[1],
    )[:MAX_STREAKS]
    section: dict = {"total": len(plan.items), **counts, "next_up": next_up}
    if streaks:
        section["habit_streaks_days"] = {title: days for title, days in streaks}
    return section


def _goals(db, user, today) -> list | None:
    from app.services import goals_service  # prevent circular import

    goals = goals_service.get_goal_list(db, user, "Active")[:MAX_GOALS]
    return [
        {
            "id": g.id,
            "title": g.title,
            "category": g.category,
            "target_date": g.target_date.isoformat(),
            "milestones": f"{g.milestones_completed}/{g.milestones_total} done",
        }
        for g in goals
    ] or None


def _latest_report(db, user, today) -> dict | None:
    from app.services import report_service  # prevent circular import

    report = report_service.get_latest_report(db, user.id)
    if report is None:
        return None
    return {"type": report.report_type, "date": report.report_date.isoformat(), "score": report.alignment_score, "headline": report.headline}


def _workout(db, user, today) -> dict | None:
    overview = workout_insights_service.overview(db, user)
    if overview.active_plan is None and overview.total_sessions == 0:
        return None
    if overview.completed_today is not None:
        today_text = f"done: {overview.completed_today.name}"
    elif overview.in_progress_session_id is not None:
        today_text = "a workout is in progress"
    elif overview.today_plan_day is not None:
        today_text = f"planned: {overview.today_plan_day.name}, about {overview.today_plan_day.estimated_minutes} min"
    else:
        today_text = "rest day" if overview.is_rest_day else "nothing planned"
    section: dict = {"today": today_text}
    if overview.active_plan is not None:
        section["plan"] = overview.active_plan.name
        section["this_week"] = f"{overview.sessions_this_week}/{overview.sessions_target} workouts"
    section["streak_weeks"] = overview.streak_weeks
    return section


def _nutrition(db, user, today) -> dict | None:
    overview = diet_overview_service.get_dashboard_overview(db, user)
    if overview is None:
        return None
    return {
        "calories": f"{round(overview.calories.consumed)}/{round(overview.calories.target)} kcal",
        "protein": f"{round(overview.protein.consumed)}/{round(overview.protein.target)} g",
        "water": f"{round(overview.water.consumed)}/{round(overview.water.target)} ml",
        "meals_logged": len(overview.meals),
    }


def _coming_up(db, user, today) -> list | None:
    from app.services import schedule_service  # prevent circular import

    items = schedule_service.get_upcoming(db, user, days=COMING_UP_DAYS)[:MAX_COMING_UP]
    return [f"{t.title}: {t.scheduled_date.isoformat()} ({weekday_name(t.scheduled_date)})" for t in items] or None


def _countdowns(db, user, today) -> list | None:
    from app.services import countdown_service  # prevent circular import

    active = [c for c in countdown_service.list_countdowns(db, user) if c.status == "active"][:MAX_COUNTDOWNS]
    return [f"{c.emoji} {c.title}: {c.days_left} days left ({c.progress_pct}% of the way)" for c in active] or None


def _journal_today(db, user, today) -> dict | None:
    entries = journal_service.get_entries(db, user, today, today)
    if not entries:
        return None
    return {"mood": entries[0].mood, "wrote_something": bool(entries[0].text.strip())}


_SECTIONS = (
    ("plan_today", _plan_today),
    ("active_goals", _goals),
    ("latest_report", _latest_report),
    ("training", _workout),
    ("nutrition_today", _nutrition),
    ("coming_up", _coming_up),
    ("countdowns", _countdowns),
    ("journal_today", _journal_today),
)


@safe_tool
def get_life_snapshot(context: ToolContext, arguments: dict) -> dict:
    db, user = context.db, context.current_user
    today = today_ist()
    result: dict = {"today": today.isoformat(), "weekday": weekday_name(today)}
    for key, build in _SECTIONS:
        try:
            section = build(db, user, today)
        except Exception:  # noqa: BLE001 - one area failing must not hide the rest of the picture
            logger.warning("Snapshot section %s failed for user %s", key, user.id, exc_info=True)
            continue
        if section:
            result[key] = section
    result["note"] = "A summary only. Missing parts have nothing to show. For detail use the specific tools."
    return result


TOOL_DEFINITIONS: dict[str, dict] = {
    "get_life_snapshot": tool_definition(
        "get_life_snapshot",
        "A quick picture of the user's day across the app: today's plan (done, left, what is next, habit streaks), active goals, the latest report, "
        "training today, nutrition today, what is coming up, their countdowns and today's mood. Call it first for broad questions like 'how am I doing', "
        "'what should I focus on' or 'plan my day', then use a specific tool only if you need detail.",
    ),
}

TOOLS = {"get_life_snapshot": get_life_snapshot}
