"""Tool for the user's saved progress reports: the daily and weekly write-ups the app already made, with their scores. Read only.

Nothing is generated here: a report costs a model call and the person asks for it on the Reports page. The tool reads what exists.
"""

from datetime import date

from sqlalchemy import desc, select

from app.common import format_duration, today_ist
from app.llm.tools.common import optional_date, safe_tool, tool_definition, trim, weekday_name
from app.llm.tools.context import ToolContext
from app.models.report import ReportDBM
from app.schemas.weekly_insights import WEEKDAYS_SHORT, WeeklyInsightsResponse

RECENT_REPORTS = 6
MAX_MISSED = 3
MAX_WEAK_HABITS = 3


def _comparison_text(item) -> str:
    def show(value) -> str:
        return "no data" if value is None else (format_duration(value) if item.kind == "minutes" else f"{value}{item.suffix or ''}")

    return f"{item.label}: {show(item.value)} (last week {show(item.previous)})"


def _weekly_extras(insights: WeeklyInsightsResponse) -> dict:
    extras: dict = {
        "day_scores_sun_to_sat": ", ".join(f"{WEEKDAYS_SHORT[i]} {d.score_pct if d.score_pct is not None else '-'}" for i, d in enumerate(insights.days)),
        "compared_with_last_week": [_comparison_text(c) for c in insights.comparison],
        "next_week_focus": {"title": insights.focus.title, "why": insights.focus.rationale},
    }
    scores = [p.score for p in insights.score_trend if p.score is not None]
    if len(scores) > 1:
        extras["weekly_scores_oldest_first"] = scores
    if insights.most_missed:
        extras["most_missed"] = [f"{m.title} x{m.misses}" for m in insights.most_missed[:MAX_MISSED]]

    def rate(habit) -> float | None:
        planned = sum(1 for c in habit.cells if c in ("done", "missed"))
        return sum(1 for c in habit.cells if c == "done") / planned if planned else None

    ranked = sorted((h for h in insights.habits if rate(h) is not None), key=rate)
    if ranked:
        extras["weakest_habits"] = [f"{h.title}: {round(rate(h) * 100)}% of the days it was due" for h in ranked[:MAX_WEAK_HABITS] if rate(h) < 1]
    return extras


def _report_row(report: ReportDBM) -> dict:
    from app.services import report_service  # prevent circular import

    data = report_service.to_report_response(report)
    row: dict = {
        "type": data.report_type,
        "date": data.date.isoformat(),
        "weekday": weekday_name(data.date),
        "alignment_score": data.alignment_score,
        "headline": data.headline,
        "summary": data.summary,
        "habits_done": f"{data.stats.habits_done}/{data.stats.habits_total}",
        "tasks_done": f"{data.stats.tasks_done}/{data.stats.tasks_total}",
        "best_streak_days": data.stats.best_streak,
        "goals": [
            {"title": g.title, "alignment_pct": g.alignment_pct, "milestone": g.milestone_title, "tasks": f"{g.tasks_done}/{g.tasks_total}", "note": trim(g.note, 200)}
            for g in data.goals
        ],
        "went_well": data.highlights.good,
        "needs_attention": data.highlights.attention,
        "closing": data.closing.message,
    }
    if data.report_type == "weekly" and data.weekly_insights is not None:
        row.update(_weekly_extras(data.weekly_insights))
    return row


@safe_tool
def get_reports(context: ToolContext, arguments: dict) -> dict:
    from app.services import report_service  # prevent circular import

    db, user = context.db, context.current_user
    today = today_ist()
    report_type = arguments.get("report_type")
    result: dict = {"today": today.isoformat(), "weekday": weekday_name(today)}

    if arguments.get("date"):
        day = date.fromisoformat(str(arguments["date"]).strip()[:10])
        found = [r for r in report_service.get_reports(db, user.id, day) if report_type in (None, r.report_type)]
        chosen = found[0] if found else None  # the newest version of that day
    else:
        query = select(ReportDBM).where(ReportDBM.user_id == user.id)
        if report_type:
            query = query.where(ReportDBM.report_type == report_type)
        chosen = db.scalar(query.order_by(desc(ReportDBM.report_date), desc(ReportDBM.generated_at)).limit(1))

    recent_query = select(ReportDBM).where(ReportDBM.user_id == user.id)
    if report_type:
        recent_query = recent_query.where(ReportDBM.report_type == report_type)
    recent = db.scalars(recent_query.order_by(desc(ReportDBM.report_date), desc(ReportDBM.generated_at)).limit(RECENT_REPORTS + 1)).all()
    if chosen is None:
        result["message"] = "There is no report for that." if arguments.get("date") else "The user has no reports yet. They can create one from the Reports page."
    else:
        result["report"] = _report_row(chosen)
    result["recent_reports"] = [
        {"date": r.report_date.isoformat(), "type": r.report_type, "score": r.alignment_score, "headline": r.headline}
        for r in recent
        if chosen is None or r.id != chosen.id
    ][:RECENT_REPORTS]
    return result


TOOL_DEFINITIONS: dict[str, dict] = {
    "get_reports": tool_definition(
        "get_reports",
        "The user's saved progress reports (daily or weekly): alignment score, headline, summary, per-goal notes, what went well, what needs "
        "attention, and for a weekly report the comparison with last week, weakest habits, most missed items and next week's focus; plus "
        "the scores of recent reports. Use it for 'how was my week', 'my last report', 'am I improving'. Latest if no date is given.",
        {
            "report_type": {"type": ["string", "null"], "enum": ["daily", "weekly", None], "description": "daily or weekly, or null for whichever is newest."},
            "date": optional_date("The report's date as YYYY-MM-DD (a weekly report is dated its last day). Null for the newest."),
        },
    ),
}

TOOLS = {"get_reports": get_reports}
