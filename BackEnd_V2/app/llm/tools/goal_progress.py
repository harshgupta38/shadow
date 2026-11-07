"""Tool for how the user's goals are really going: milestones and tasks, and how much of the daily work behind each goal gets done.

The goal tools that already exist describe a goal as written. This one adds what happened: the recent completion of the habits, tasks
and scheduled items linked to a goal, when it was last worked on, and what keeps being missed. Read only.
"""

from datetime import timedelta

from app.common import today_ist
from app.llm.tools.common import safe_tool, tool_definition, trim, weekday_name
from app.llm.tools.context import ToolContext
from app.services import plan_insights_service as insights

RECENT_DAYS = 14  # the latest fortnight, set against the one before it
WINDOW_DAYS = RECENT_DAYS * 2
MAX_GOALS = 8
MAX_TASKS = 25
MAX_MISSED = 5
_TASK_DONE = {"Completed", "Cancelled"}


def _activity(goal_id: int, records, links: dict, today) -> dict:
    """The recent and the earlier fortnight of one goal's linked items, from plan records already loaded."""
    mine = [r for r in records if links.get((r.source_type, r.source_id)) == goal_id]
    cut = today - timedelta(days=RECENT_DAYS - 1)
    recent = [r for r in mine if r.scheduled_date >= cut]
    earlier = [r for r in mine if r.scheduled_date < cut]
    now, before = insights.totals(recent, today), insights.totals(earlier, today)
    done_days = [r.scheduled_date for r in mine if insights.classify(r, today) == "done"]
    activity: dict = {
        f"last_{RECENT_DAYS}_days": insights.percent_text(now["done"], now["done"] + now["missed"]),
        f"the_{RECENT_DAYS}_days_before": insights.percent_text(before["done"], before["done"] + before["missed"]),
    }
    if done_days:
        last = max(done_days)
        activity["last_worked_on"] = last.isoformat()
        activity["days_since_worked_on"] = (today - last).days
    else:
        activity["last_worked_on"] = None
    missed = sorted((t for t in insights.tally(recent, today) if t.missed), key=lambda t: -t.missed)[:MAX_MISSED]
    if missed:
        activity["missed_recently"] = [f"{t.title} x{t.missed}" for t in missed]
    return activity


def _goal_summary(goal, milestones, activity: dict | None) -> dict:
    row: dict = {
        "id": goal.id,
        "title": goal.title,
        "category": goal.category,
        "status": goal.status,
        "target_date": goal.target_date.isoformat(),
        "days_left": (goal.target_date - today_ist()).days,
        "milestones": f"{goal.milestones_completed}/{goal.milestones_total} done",
    }
    current = next((m for m in milestones if m.status == "In Progress"), None) or next((m for m in milestones if m.status == "Not Started"), None)
    if current:
        row["current_milestone"] = current.title
    if activity:
        row.update(activity)
    return row


@safe_tool
def get_goal_progress(context: ToolContext, arguments: dict) -> dict:
    from app.services import goals_service, milestones_service, tasks_service  # prevent circular import

    db, user = context.db, context.current_user
    today = today_ist()
    goal_id = arguments.get("goal_id")
    result: dict = {"today": today.isoformat(), "weekday": weekday_name(today)}

    if goal_id is not None:
        detail = goals_service.get_goal_detail(db, user, goal_id)
        milestones = milestones_service.get_milestone_list(db, user, goal_id, None)
        records = insights.records_between(db, user.id, today - timedelta(days=WINDOW_DAYS - 1), today)
        links = insights.goal_ids_by_source(db, user.id, {(r.source_type, r.source_id) for r in records})
        goal = _goal_summary(detail, milestones, _activity(goal_id, records, links, today))
        goal["summary"] = trim(detail.summary, 240)
        goal["success_definition"] = trim(detail.success_definition, 240)
        if detail.success_metrics:
            goal["success_metrics"] = detail.success_metrics[:6]
        goal["milestone_list"] = [
            {
                "id": m.id,
                "title": m.title,
                "status": m.status,
                "tasks": f"{m.completed_tasks}/{m.total_tasks} done",
                **({"target_date": m.target_date.isoformat()} if m.target_date else {}),
            }
            for m in milestones
        ]
        tasks = []
        for m in milestones:
            if m.status in ("Completed", "Cancelled"):
                continue
            for t in tasks_service.get_list(db, user, m.id):
                row = {"id": t.id, "title": t.title, "milestone": m.title, "status": t.status}
                if t.task_type == "Numeric" and t.target_value:
                    row["progress"] = f"{t.current_value or 0}/{t.target_value}{f' {t.value_unit}' if t.value_unit else ''}"
                if t.planning_enabled and t.status not in _TASK_DONE:
                    row["on_the_plan"] = True
                tasks.append(row)
        goal["open_tasks"] = tasks[:MAX_TASKS]
        if len(tasks) > MAX_TASKS:
            goal["open_tasks_note"] = f"Only the first {MAX_TASKS} of {len(tasks)} are listed."
        habit_records = [r for r in records if r.source_type == "habit" and links.get((r.source_type, r.source_id)) == goal_id]
        goal["habits"] = [
            {"title": t.title, f"last_{WINDOW_DAYS}_days": insights.percent_text(t.done, t.planned)}
            for t in insights.tally(habit_records, today)
        ]
        result["goal"] = goal
        return result

    goals = goals_service.get_goal_list(db, user, "Active")[:MAX_GOALS]
    if not goals:
        result["message"] = "The user has no active goals."
        return result
    records = insights.records_between(db, user.id, today - timedelta(days=WINDOW_DAYS - 1), today)
    links = insights.goal_ids_by_source(db, user.id, {(r.source_type, r.source_id) for r in records})
    result["goals"] = [
        _goal_summary(g, milestones_service.get_milestone_list(db, user, g.id, None), _activity(g.id, records, links, today)) for g in goals
    ]
    result["note"] = "Pass a goal_id for its milestones, open tasks and linked habits."
    return result


TOOL_DEFINITIONS: dict[str, dict] = {
    "get_goal_progress": tool_definition(
        "get_goal_progress",
        "How the user's goals are really going. With no goal_id: each active goal with milestones done, the current milestone, days left, how much "
        "of its linked daily work was done in the last two weeks against the two before, when it was last worked on and what was missed. "
        "With a goal_id: also its milestones, open tasks with progress and linked habits. Use it for 'how are my goals going', 'what is "
        "stalling', 'am I on track for X', and to find a goal's id.",
        {"goal_id": {"type": ["integer", "null"], "minimum": 1, "description": "One goal's id, or null for an overview of all active goals."}},
    ),
}

TOOLS = {"get_goal_progress": get_goal_progress}
