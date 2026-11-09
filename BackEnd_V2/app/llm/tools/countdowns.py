"""Tool for the user's countdowns: the dates they are counting down to, how close each is, and the tasks and notes on the way. Read only."""

from app.common import today_ist
from app.llm.tools.common import safe_tool, tool_definition, trim, weekday_name
from app.llm.tools.context import ToolContext

MAX_TASKS_LISTED = 4


@safe_tool
def get_countdowns(context: ToolContext, arguments: dict) -> dict:
    from app.services import countdown_service  # prevent circular import

    db, user = context.db, context.current_user
    today = today_ist()
    include_achieved = bool(arguments.get("include_achieved"))
    rows = [c for c in countdown_service.list_countdowns(db, user) if include_achieved or c.status == "active"]
    result: dict = {"today": today.isoformat(), "weekday": weekday_name(today), "count": len(rows)}
    if not rows:
        result["message"] = "The user has no countdowns." if include_achieved else "The user has no active countdowns."
        return result

    countdowns = []
    for c in rows:
        row: dict = {
            "id": c.id,
            "title": c.title,
            "target_date": c.target_date.isoformat(),
            "weekday": weekday_name(c.target_date),
            "status": c.status,
        }
        if c.status == "active":
            row["days_left"] = c.days_left
            row["percent_of_the_way"] = c.progress_pct
            if c.days_left < 0:
                row["note_on_date"] = "The date has passed and the user has not marked it as achieved yet."
        if c.note:
            row["why_it_matters"] = trim(c.note, 200)
        row["tasks"] = f"{c.tasks_done}/{c.tasks_total} done"
        row["journal_notes"] = c.notes_count
        if c.status == "active" and c.tasks_total > c.tasks_done:
            detail = countdown_service.get_countdown(db, user, c.id)
            row["next_tasks"] = [
                f"{t.title} ({t.scheduled_date.isoformat()})" for t in detail.tasks if t.status in ("upcoming", "snoozed")
            ][:MAX_TASKS_LISTED]
        countdowns.append(row)
    result["countdowns"] = countdowns
    return result


TOOL_DEFINITIONS: dict[str, dict] = {
    "get_countdowns": tool_definition(
        "get_countdowns",
        "The dates the user is counting down to (a trip, an exam, an event): days left, how far along they are, why it matters to them, the "
        "tasks they scheduled for it and how many journal notes they wrote about it. Use it for 'how long until X', 'am I ready for my trip', "
        "'what is left to do before X'.",
        {"include_achieved": {"type": "boolean", "description": "True to include countdowns the user has already achieved. Usually false."}},
    ),
}

TOOLS = {"get_countdowns": get_countdowns}
