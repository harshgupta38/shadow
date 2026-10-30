"""Weekly-report analytics, computed deterministically from plan records.

Two phases, so nothing the LLM can get wrong is ever left to the LLM:

1. ``compute_weekly_metrics`` runs before report generation. Everything it returns is
   exact (counts, rates, deltas) and is also fed to the LLM as ground truth.
2. ``finalize_weekly_insights`` runs after, merging in the few values that depend on the
   LLM result (alignment score, per-goal alignment, the focus wording) and validating the
   final shape against ``WeeklyInsightsResponse`` before it is stored on the report row.

Window convention (same as report_service): ``week_end`` is the Saturday the weekly report
is dated; the window is Sunday–Saturday, and "previous week" is the 7 days before it.
"""
import logging
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common import today_ist, to_ist
from app.models.goal import GoalDBM
from app.models.habit import HabitDBM
from app.models.milestone import MilestoneDBM
from app.models.plan import PlanDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.report import ReportDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.task import TaskDBM
from app.schemas.weekly_insights import WEEKDAYS_LONG, WeeklyInsightsResponse

log = logging.getLogger(__name__)

STRONG_DAY_PCT = 70
TREND_WEEKS = 6  # current week + 5 prior
MAX_HABITS = 40
MAX_MISSED_ITEMS = 3
MAX_TOP_PRIORITY_MISSES = 5
MIN_TIER_SAMPLE = 3  # priority tiers thinner than this aren't compared
MIN_SLOT_SAMPLE = 10  # slots with fewer planned items than this are too thin to rank
MIN_HABIT_SAMPLE = 3
NOTE_MAX_CHARS = 160
FOCUS_TITLE_MAX_CHARS = 60
FOCUS_RATIONALE_MAX_CHARS = 300

# Cut-offs for choosing next week's focus (see _pick_focus).
TARGET_STEP_PTS = 15  # how far above today's value a focus target sits
PRIORITY_GAP_PTS = 10  # highest tier trails the lowest tier by more than this
HABIT_SLIP_PTS = 15  # a habit's consistency fell by at least this much versus last week
SLOT_GAP_PTS = 20  # best time slot beats the worst by at least this much...
SLOT_WEAK_BELOW_PCT = 80  # ...and the worst slot is under this
WEAK_DAY_BELOW_PCT = 55
WEAK_DAY_GAP_PTS = 30  # the weak day trails the best day by at least this much
WEAK_DAY_STEP_PTS = 20
WEAK_DAY_TARGET_PCT = 65
MIN_DAYS_FOR_WEAK_DAY = 3
STEADY_STRONG_PCT = 80
STEADY_OK_PCT = 70

_SLOTS = ("morning", "afternoon", "evening", "night")
_SLOT_LABEL = {"morning": "Morning", "afternoon": "Afternoon", "evening": "Evening", "night": "Night"}
_TIERS = ("highest", "high", "medium", "low")
_TIER_OF = {"highest": "highest", "high": "high", "medium": "medium", "low": "low", "lowest": "low"}
_PRIORITY_RANK = {"highest": 0, "high": 1, "medium": 2, "low": 3, "lowest": 4}


# ── Small helpers ─────────────────────────────────────────────────────────────

def _credit(r: DailyPlanRecordDBM) -> float:
    """Partial credit for metric items, binary otherwise — identical to the monthly
    calendar's score formula (reports_service.get_monthly_report) so both views agree."""
    if r.planner_type == "metric" and r.planner_target and r.planner_target > 0:
        return min(1.0, r.actual_value / r.planner_target)
    return 1.0 if r.status == "done" else 0.0


def _score(recs: list[DailyPlanRecordDBM]) -> int | None:
    if not recs:
        return None
    return round(sum(_credit(r) for r in recs) / len(recs) * 100)


def _rate(done: int, total: int) -> int | None:
    return round(done / total * 100) if total > 0 else None


def _is_task_like(r: DailyPlanRecordDBM) -> bool:
    return r.source_type in ("task", "schedule")


def _slot_for(r: DailyPlanRecordDBM) -> str | None:
    """Time-of-day slot of the *planned* time. completed_at is deliberately not used: users
    tick several items at once, so it says when they checked in, not when they did the work."""
    if r.preferred_time in _SLOTS:
        return r.preferred_time
    if r.preferred_time == "custom" and r.specific_time:
        try:
            hour = int(r.specific_time.split(":")[0])
        except ValueError:
            return None
        if 5 <= hour < 12:
            return "morning"
        if 12 <= hour < 17:
            return "afternoon"
        if 17 <= hour < 21:
            return "evening"
        return "night"
    return None


def _nice_target(current: int, wanted: int) -> int | None:
    """A reachable, round-ish target strictly above the current value; None when there is no room above it."""
    target = min(100, int(round(wanted / 5.0)) * 5)
    return target if target > current else None


def clamp_pct(value: int) -> int:
    """Percentages written by the LLM are clamped into 0..100 rather than rejecting the whole report."""
    return min(100, max(0, value))


def _in_progress(r: DailyPlanRecordDBM, today: date) -> bool:
    """A record still due on today or a later day is in progress, not missed: the planner reads a
    due record as missed only once its day has passed. Skipped records are excused, never in progress."""
    return not r.skipped and r.status == "due" and r.scheduled_date >= today


def _clean_text(value: str | None, max_chars: int) -> str | None:
    """Whitespace-normalised text, or None when empty or too long to trust as written."""
    if value is None:
        return None
    text = " ".join(value.split())
    if not text or len(text) > max_chars:
        return None
    return text


def _truncate(value: str, max_chars: int) -> str:
    text = " ".join(value.split())
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


def _group_by_date(recs: list[DailyPlanRecordDBM]) -> dict[date, list[DailyPlanRecordDBM]]:
    grouped: dict[date, list[DailyPlanRecordDBM]] = defaultdict(list)
    for r in recs:
        grouped[r.scheduled_date].append(r)
    return grouped


# ── Sections ──────────────────────────────────────────────────────────────────

def _build_days(cur: list[DailyPlanRecordDBM], prev: list[DailyPlanRecordDBM], week_start: date) -> list[dict]:
    by_date = _group_by_date(cur)
    prev_by_date = _group_by_date(prev)
    days = []
    for i in range(7):
        d = week_start + timedelta(days=i)
        recs = by_date.get(d, [])
        tasks = [r for r in recs if _is_task_like(r)]
        habits = [r for r in recs if r.source_type == "habit"]
        days.append({
            "tasks_done": sum(1 for r in tasks if r.status == "done"),
            "tasks_total": len(tasks),
            "habits_done": sum(1 for r in habits if r.status == "done"),
            "habits_total": len(habits),
            "score_pct": _score(recs),
            "prev_score_pct": _score(prev_by_date.get(d - timedelta(days=7), [])),
        })
    return days


def _build_comparison(days: list[dict], cur: list[DailyPlanRecordDBM], prev: list[DailyPlanRecordDBM]) -> list[dict]:
    def completion(recs: list[DailyPlanRecordDBM], kind: str) -> int | None:
        pool = [r for r in recs if (_is_task_like(r) if kind == "tasks" else r.source_type == "habit")]
        return _rate(sum(1 for r in pool if r.status == "done"), len(pool))

    def strong_days(by_date: dict[date, list[DailyPlanRecordDBM]]) -> int:
        return sum(1 for recs in by_date.values() if (_score(recs) or 0) >= STRONG_DAY_PCT)

    def minutes(recs: list[DailyPlanRecordDBM]) -> int:
        return sum(r.duration_minutes or 0 for r in recs if r.status == "done")

    comparison: list[dict] = []
    for metric_id, label, kind in (("tasks", "Tasks completed", "tasks"), ("habits", "Habits completed", "habits")):
        value = completion(cur, kind)
        if value is not None:
            comparison.append({
                "id": metric_id, "label": label, "value": value,
                "previous": completion(prev, kind), "kind": "points", "suffix": "%",
            })

    if any(d["score_pct"] is not None for d in days):
        comparison.append({
            "id": "strong_days", "label": f"Days above {STRONG_DAY_PCT}%",
            "value": strong_days(_group_by_date(cur)),
            "previous": strong_days(_group_by_date(prev)) if prev else None,
            "kind": "days", "suffix": "/7",
        })

    cur_minutes, prev_minutes = minutes(cur), minutes(prev)
    if cur_minutes > 0 or prev_minutes > 0:
        comparison.append({
            "id": "focus_time", "label": "Planned time done", "value": cur_minutes,
            "previous": prev_minutes if prev else None, "kind": "minutes", "suffix": None,
        })
    return comparison


def _habit_streaks(db: Session, user_id: int, habit_ids: set[int], week_end: date) -> dict[int, int]:
    # Imported lazily: planner_service imports report_service at module load.
    from app.services import planner_service

    if not habit_ids:
        return {}
    plans = db.scalars(
        select(PlanDBM).where(
            PlanDBM.user_id == user_id,
            PlanDBM.source_type == "habit",
            PlanDBM.source_id.in_(habit_ids),
        )
    ).all()
    streaks: dict[int, int] = {}
    for plan in plans:
        try:
            streaks[plan.source_id] = planner_service.compute_streaks_for_plan(db, plan, week_end)[0]
        except Exception:
            log.warning("Streak computation failed for habit plan %s", plan.id, exc_info=True)
    return streaks


def _build_habits(
    db: Session,
    user_id: int,
    cur_all: list[DailyPlanRecordDBM],
    prev: list[DailyPlanRecordDBM],
    week_start: date,
    week_end: date,
) -> list[dict]:
    by_habit: dict[int, list[DailyPlanRecordDBM]] = defaultdict(list)
    for r in cur_all:
        if r.source_type == "habit" and r.source_id:
            by_habit[r.source_id].append(r)

    prev_by_habit: dict[int, list[DailyPlanRecordDBM]] = defaultdict(list)
    for r in prev:
        if r.source_type == "habit" and r.source_id:
            prev_by_habit[r.source_id].append(r)

    rows = []
    for habit_id, recs in by_habit.items():
        by_date = {r.scheduled_date: r for r in recs}
        cells = []
        for i in range(7):
            r = by_date.get(week_start + timedelta(days=i))
            if r is None:
                cells.append("none")
            elif r.skipped:
                cells.append("skipped")
            else:
                cells.append("done" if r.status == "done" else "missed")
        if not any(c in ("done", "missed") for c in cells):
            continue  # nothing planned that counted (e.g. skipped all week): nothing to report
        prev_recs = prev_by_habit.get(habit_id, [])
        rows.append({
            "id": habit_id,
            "title": max(recs, key=lambda r: r.scheduled_date).title,
            "cells": cells,
            "streak": 0,
            "prev_done": sum(1 for r in prev_recs if r.status == "done"),
            "prev_planned": len(prev_recs),
        })

    streaks = _habit_streaks(db, user_id, {h["id"] for h in rows}, week_end)
    for h in rows:
        h["streak"] = streaks.get(h["id"], 0)

    rows.sort(key=lambda h: (-sum(1 for c in h["cells"] if c in ("done", "missed")), h["title"].lower()))
    return rows[:MAX_HABITS]


def _build_priorities(cur: list[DailyPlanRecordDBM]) -> list[dict]:
    totals = {t: [0, 0] for t in _TIERS}  # [done, total]
    for r in cur:
        tier = _TIER_OF.get(r.priority)
        if tier is None:
            continue
        totals[tier][1] += 1
        if r.status == "done":
            totals[tier][0] += 1
    return [{"priority": t, "done": totals[t][0], "total": totals[t][1]} for t in _TIERS if totals[t][1] > 0]


def _build_top_misses(settled: list[DailyPlanRecordDBM]) -> list[str]:
    missed_highest: dict[str, int] = defaultdict(int)
    for r in settled:
        if r.priority == "highest" and r.status != "done":
            missed_highest[r.title] += 1
    ranked = sorted(missed_highest.items(), key=lambda kv: (-kv[1], kv[0].lower()))[:MAX_TOP_PRIORITY_MISSES]
    return [f"{title} ×{n}" if n > 1 else title for title, n in ranked]


def _build_time_slots(cur: list[DailyPlanRecordDBM], week_start: date) -> tuple[list[dict], int]:
    done = {s: [0] * 7 for s in _SLOTS}
    planned = {s: [0] * 7 for s in _SLOTS}
    unslotted = 0
    for r in cur:
        slot = _slot_for(r)
        if slot is None:
            unslotted += 1
            continue
        i = (r.scheduled_date - week_start).days
        planned[slot][i] += 1
        if r.status == "done":
            done[slot][i] += 1
    slots = [{"id": s, "done": done[s], "planned": planned[s]} for s in _SLOTS if sum(planned[s]) > 0]
    return slots, unslotted


def _build_most_missed(cur: list[DailyPlanRecordDBM]) -> list[dict]:
    groups: dict[tuple, list[DailyPlanRecordDBM]] = defaultdict(list)
    for r in cur:
        if r.status != "done":
            groups[(r.source_type, r.source_id or r.title)].append(r)

    repeated = [recs for recs in groups.values() if len(recs) >= 2]
    repeated.sort(key=lambda recs: (
        -len(recs),
        min(_PRIORITY_RANK.get(r.priority, 99) for r in recs),
        recs[0].title.lower(),
    ))

    items = []
    for n, recs in enumerate(repeated[:MAX_MISSED_ITEMS], start=1):
        noted = [r for r in sorted(recs, key=lambda r: r.scheduled_date, reverse=True) if r.note and r.note.strip()]
        note = _truncate(noted[0].note, NOTE_MAX_CHARS) if noted else None
        items.append({
            "id": n,
            "title": recs[0].title,
            "kind": recs[0].source_type if recs[0].source_type in ("habit", "task", "schedule") else "task",
            "misses": len(recs),
            "note": note,
        })
    return items


def _previous_weekly_reports(db: Session, user_id: int, week_end: date) -> dict[date, ReportDBM]:
    """Latest generated version of each of the prior TREND_WEEKS-1 weekly reports, by report date."""
    dates = [week_end - timedelta(days=7 * k) for k in range(1, TREND_WEEKS)]
    rows = db.scalars(
        select(ReportDBM)
        .where(
            ReportDBM.user_id == user_id,
            ReportDBM.report_type == "weekly",
            ReportDBM.report_date.in_(dates),
        )
        .order_by(ReportDBM.report_date, ReportDBM.generated_at.desc())
    ).all()
    latest: dict[date, ReportDBM] = {}
    for r in rows:
        latest.setdefault(r.report_date, r)  # first per date is the newest version
    return latest


def _build_goals(
    db: Session,
    user_id: int,
    cur: list[DailyPlanRecordDBM],
    habit_goal: dict[int, int | None],
    week_start: date,
    week_end: date,
    prev_goal_alignment: dict[int, int],
) -> list[dict]:
    task_ids = {r.source_id for r in cur if r.source_type == "task" and r.source_id}
    sched_ids = {r.source_id for r in cur if r.source_type == "schedule" and r.source_id}
    task_goal = (
        dict(db.execute(select(TaskDBM.id, TaskDBM.goal_id).where(TaskDBM.id.in_(task_ids), TaskDBM.user_id == user_id)).all())
        if task_ids else {}
    )
    sched_goal = (
        dict(db.execute(
            select(ScheduledTaskDBM.id, ScheduledTaskDBM.goal_id).where(
                ScheduledTaskDBM.id.in_(sched_ids), ScheduledTaskDBM.user_id == user_id,
            )
        ).all())
        if sched_ids else {}
    )

    def goal_of(r: DailyPlanRecordDBM) -> int | None:
        if r.source_type == "habit":
            return habit_goal.get(r.source_id)
        if r.source_type == "task":
            return task_goal.get(r.source_id)
        if r.source_type == "schedule":
            return sched_goal.get(r.source_id)
        return None

    by_goal: dict[int, list[DailyPlanRecordDBM]] = defaultdict(list)
    for r in cur:
        gid = goal_of(r)
        if gid:
            by_goal[gid].append(r)
    if not by_goal:
        return []

    goals = db.scalars(
        select(GoalDBM).where(GoalDBM.user_id == user_id, GoalDBM.status == "Active", GoalDBM.id.in_(set(by_goal)))
        .order_by(GoalDBM.position, GoalDBM.id)
    ).all()

    result = []
    for goal in goals:
        recs = by_goal[goal.id]
        by_date = _group_by_date(recs)
        milestone = db.scalar(
            select(MilestoneDBM)
            .where(MilestoneDBM.goal_id == goal.id, MilestoneDBM.status == "In Progress")
            .order_by(MilestoneDBM.position, MilestoneDBM.id)
        )
        done_now = done_before = total = 0
        if milestone is not None:
            completed_dates = [
                to_ist(c).date()
                for c in db.scalars(
                    select(TaskDBM.completed_at).where(
                        TaskDBM.milestone_id == milestone.id,
                        TaskDBM.status == "Completed",
                        TaskDBM.completed_at.isnot(None),
                    )
                ).all()
            ]
            done_now = sum(1 for d in completed_dates if d <= week_end)
            done_before = sum(1 for d in completed_dates if d < week_start)
            total = max(milestone.total_tasks, done_now)
        result.append({
            "id": goal.id,
            "title": goal.title,
            "milestone_title": milestone.title if milestone else "No active milestone",
            "computed_pct": _score(recs) or 0,
            "prev_alignment_pct": prev_goal_alignment.get(goal.id),
            "daily_pct": [_score(by_date.get(week_start + timedelta(days=i), [])) for i in range(7)],
            "milestone_done": done_now,
            "milestone_total": total,
            "milestone_done_prev_week": done_before,
        })
    return result


# ── Next-week focus ───────────────────────────────────────────────────────────

def _pick_focus(
    overall: int,
    days: list[dict],
    priorities: list[dict],
    habits: list[dict],
    slots: list[dict],
) -> dict:
    """Choose the single most useful, measurable thing to improve next week. The numbers and a
    fallback wording are fixed here; the LLM may only rephrase title/rationale (see finalize)."""

    # 1. Highest-priority work finishing worse than low-priority work.
    rated = [(t, _rate(t["done"], t["total"])) for t in priorities if t["total"] >= MIN_TIER_SAMPLE]
    if len(rated) >= 2:
        (top, top_rate), (bottom, bottom_rate) = rated[0], rated[-1]
        if top_rate + PRIORITY_GAP_PTS < bottom_rate:
            top_name, bottom_name = top["priority"], bottom["priority"]
            return {
                "kind": "priority_gap",
                "metric_label": f"{top_name.capitalize()}-priority completion",
                "current_pct": top_rate,
                "target_pct": _nice_target(top_rate, top_rate + TARGET_STEP_PTS),
                "title": "Start with what matters",
                "rationale": (
                    f"{top_name.capitalize()}-priority items were finished {top_rate}% of the time, "
                    f"while {bottom_name}-priority items hit {bottom_rate}%. "
                    "Do your most important item first each day."
                ),
                "evidence": (
                    f"{top_name}-priority items done {top['done']}/{top['total']} ({top_rate}%) vs "
                    f"{bottom_name}-priority items {bottom['done']}/{bottom['total']} ({bottom_rate}%)."
                ),
            }

    # 2. A habit that clearly slipped versus last week.
    slipped = []
    for h in habits:
        planned = sum(1 for c in h["cells"] if c in ("done", "missed"))
        if planned < MIN_HABIT_SAMPLE or h["prev_planned"] < MIN_HABIT_SAMPLE:
            continue
        value = _rate(sum(1 for c in h["cells"] if c == "done"), planned) or 0
        prev_value = _rate(h["prev_done"], h["prev_planned"]) or 0
        if value - prev_value <= -HABIT_SLIP_PTS:
            slipped.append((value - prev_value, value, prev_value, h["title"]))
    if slipped:
        _, value, prev_value, title = min(slipped)
        short = title if len(title) <= 32 else title[:31].rstrip() + "…"
        return {
            "kind": "habit_slip",
            "metric_label": f"{short} consistency",
            "current_pct": value,
            "target_pct": _nice_target(value, prev_value),
            "title": f"Bring back {short}",
            "rationale": (
                f"{title} dropped from {prev_value}% to {value}% this week. "
                "Pick a fixed time for it and attach it to something you already do every day."
            ),
            "evidence": f"Habit '{title}' consistency fell from {prev_value}% to {value}%.",
        }

    # 3. A time slot that fails far more often than the best one.
    ranked = []
    for s in slots:
        planned = sum(s["planned"])
        if planned >= MIN_SLOT_SAMPLE:
            ranked.append((_rate(sum(s["done"]), planned) or 0, s["id"], sum(s["done"]), planned))
    if len(ranked) >= 2:
        worst, best = min(ranked), max(ranked)
        if best[0] - worst[0] >= SLOT_GAP_PTS and worst[0] < SLOT_WEAK_BELOW_PCT:
            slot_name, best_name = _SLOT_LABEL[worst[1]], _SLOT_LABEL[best[1]]
            return {
                "kind": "slot_weak",
                "metric_label": f"{slot_name} completion",
                "current_pct": worst[0],
                "target_pct": _nice_target(worst[0], worst[0] + TARGET_STEP_PTS),
                "title": f"Protect your {worst[1]}s",
                "rationale": (
                    f"{slot_name} items were finished {worst[0]}% of the time versus {best[0]}% for "
                    f"{best_name.lower()}. Move one {worst[1]} item to the {best[1]} or plan fewer."
                ),
                "evidence": (
                    f"{worst[1]} slot {worst[2]}/{worst[3]} done ({worst[0]}%) vs "
                    f"{best[1]} slot {best[2]}/{best[3]} ({best[0]}%)."
                ),
            }

    # 4. One clearly weak weekday.
    scored = [(d["score_pct"], i) for i, d in enumerate(days) if d["score_pct"] is not None]
    if len(scored) >= MIN_DAYS_FOR_WEAK_DAY:
        low, low_i = min(scored)
        high, _ = max(scored)
        if low < WEAK_DAY_BELOW_PCT and high - low >= WEAK_DAY_GAP_PTS:
            name = WEEKDAYS_LONG[low_i]
            return {
                "kind": "weak_day",
                "metric_label": f"{name} score",
                "current_pct": low,
                "target_pct": _nice_target(low, max(low + WEAK_DAY_STEP_PTS, WEAK_DAY_TARGET_PCT)),
                "title": f"Fix your {name}s",
                "rationale": (
                    f"{name} was your softest day at {low}%, against {high}% on your best day. "
                    f"Plan a lighter {name} so a rough day doesn't drag the week down."
                ),
                "evidence": f"{name} scored {low}% while the best day scored {high}%.",
            }

    # 5. Nothing stands out — protect what works.
    return {
        "kind": "steady",
        "metric_label": "Overall score",
        "current_pct": overall,
        "target_pct": _nice_target(overall, overall + (5 if overall >= STEADY_STRONG_PCT else 10)),
        "title": "Keep the rhythm" if overall >= STEADY_OK_PCT else "Build a steadier week",
        "rationale": (
            f"You finished the week at {overall}% with no single weak spot. "
            "Keep the same routine and add nothing new until it feels easy."
            if overall >= STEADY_OK_PCT else
            f"The week landed at {overall}% with the misses spread out. "
            "Cut your plan down to the few items that matter most and finish those first."
        ),
        "evidence": f"Overall score {overall}% with no single dominant weak area.",
    }


# ── Public API ────────────────────────────────────────────────────────────────

def compute_weekly_metrics(db: Session, user_id: int, week_end: date) -> dict | None:
    """Everything that can be known exactly before the LLM runs. Returns None when the week
    has no countable records (nothing to analyse)."""
    week_start = week_end - timedelta(days=6)
    prev_start = week_start - timedelta(days=7)

    rows = list(db.scalars(
        select(DailyPlanRecordDBM).where(
            DailyPlanRecordDBM.user_id == user_id,
            DailyPlanRecordDBM.scheduled_date >= prev_start,
            DailyPlanRecordDBM.scheduled_date <= week_end,
        )
    ).all())

    habit_ids = {r.source_id for r in rows if r.source_type == "habit" and r.source_id}
    habits = (
        {h.id: h for h in db.scalars(select(HabitDBM).where(HabitDBM.id.in_(habit_ids), HabitDBM.user_id == user_id)).all()}
        if habit_ids else {}
    )
    # Habits the user opted out of report accounting vanish from every aggregate.
    opted_out = {hid for hid, h in habits.items() if not h.include_in_report}
    rows = [r for r in rows if not (r.source_type == "habit" and r.source_id in opted_out)]

    cur_all = [r for r in rows if r.scheduled_date >= week_start]
    prev_all = [r for r in rows if r.scheduled_date < week_start]
    # Skipped occurrences are excused absences: they never count toward any total.
    cur = [r for r in cur_all if not r.skipped]
    prev = [r for r in prev_all if not r.skipped]
    # Due on today or a later day is still in progress, not missed. The day bars and the tier and
    # slot totals show the day so far; miss lists and the next-week focus use settled records only.
    today = today_ist()
    settled = [r for r in cur if not _in_progress(r, today)]
    settled_all = [r for r in cur_all if not _in_progress(r, today)]
    if not settled:
        return None

    overall = _score(settled) or 0
    days = _build_days(cur, prev, week_start)
    habit_rows = _build_habits(db, user_id, settled_all, prev, week_start, week_end)
    slots, unslotted = _build_time_slots(cur, week_start)

    prior_reports = _previous_weekly_reports(db, user_id, week_end)
    prev_report = prior_reports.get(week_end - timedelta(days=7))
    prev_goal_alignment = {
        g["id"]: g["alignment_pct"]
        for g in (prev_report.goals if prev_report else [])
        if isinstance(g, dict) and "id" in g and "alignment_pct" in g
    }
    trend_prior = []
    for k in range(TREND_WEEKS - 1, 0, -1):
        d = week_end - timedelta(days=7 * k)
        report = prior_reports.get(d)
        trend_prior.append({"week_end": d.isoformat(), "score": report.alignment_score if report else None})

    # The open day's bar is left out of the focus: its score is still moving.
    focus_days = [{**d, "score_pct": None} if week_start + timedelta(days=i) >= today else d for i, d in enumerate(days)]
    return {
        "week_end": week_end.isoformat(),
        "days": days,
        "comparison": _build_comparison(days, cur, prev),
        "prev_alignment_score": prev_report.alignment_score if prev_report else None,
        "trend_prior": trend_prior,
        "habits": habit_rows,
        "priorities": _build_priorities(cur),
        "top_priority_misses": _build_top_misses(settled),
        "time_slots": slots,
        "unslotted_count": unslotted,
        "most_missed": _build_most_missed(settled),
        "goals": _build_goals(
            db, user_id, cur, {hid: h.goal_id for hid, h in habits.items()},
            week_start, week_end, prev_goal_alignment,
        ),
        "focus_candidate": _pick_focus(
            overall, focus_days, _build_priorities(settled), habit_rows, _build_time_slots(settled, week_start)[0],
        ),
    }


def finalize_weekly_insights(
    metrics: dict,
    *,
    alignment_score: int,
    goal_alignment: dict[int, int],
    focus_title: str | None = None,
    focus_rationale: str | None = None,
) -> dict:
    """Merge the LLM-dependent values into the pre-computed metrics and validate the result.
    Returns the JSON-ready dict stored on ReportDBM.weekly_insights."""
    alignment_score = clamp_pct(alignment_score)
    goal_alignment = {gid: clamp_pct(pct) for gid, pct in goal_alignment.items()}
    candidate = metrics["focus_candidate"]
    title = _clean_text(focus_title, FOCUS_TITLE_MAX_CHARS)
    rationale = _clean_text(focus_rationale, FOCUS_RATIONALE_MAX_CHARS)
    if not (title and rationale):
        title, rationale = candidate["title"], candidate["rationale"]

    payload = {
        "days": metrics["days"],
        "comparison": [
            {
                "id": "alignment", "label": "Alignment score", "value": alignment_score,
                "previous": metrics["prev_alignment_score"], "kind": "points", "suffix": None,
            },
            *metrics["comparison"],
        ],
        "score_trend": [*metrics["trend_prior"], {"week_end": metrics["week_end"], "score": alignment_score}],
        "habits": metrics["habits"],
        "priorities": metrics["priorities"],
        "top_priority_misses": metrics["top_priority_misses"],
        "time_slots": metrics["time_slots"],
        "unslotted_count": metrics["unslotted_count"],
        "most_missed": metrics["most_missed"],
        "goals": [
            {
                **{k: v for k, v in g.items() if k != "computed_pct"},
                "alignment_pct": goal_alignment.get(g["id"], g["computed_pct"]),
            }
            for g in metrics["goals"]
        ],
        "focus": {
            "title": title,
            "rationale": rationale,
            "metric_label": candidate["metric_label"],
            "current_pct": candidate["current_pct"],
            "target_pct": candidate["target_pct"],
        },
    }
    return WeeklyInsightsResponse.model_validate(payload).model_dump(mode="json")


def ensure_weekly_insights(db: Session, reports: list[ReportDBM]) -> None:
    """Lazy backfill for weekly reports generated before insights existed. Idempotent, and
    never raises: a failure here must not break opening the report. Versions of the same
    week share one metrics computation; only the LLM-dependent values differ per version."""
    pending: dict[tuple[int, date], list[ReportDBM]] = defaultdict(list)
    for r in reports:
        if r.report_type == "weekly" and r.weekly_insights is None:
            pending[(r.user_id, r.report_date)].append(r)

    for (user_id, report_date), versions in pending.items():
        try:
            metrics = compute_weekly_metrics(db, user_id, report_date)
            if metrics is None:
                continue
            for r in versions:
                r.weekly_insights = finalize_weekly_insights(
                    metrics,
                    alignment_score=r.alignment_score,
                    goal_alignment={g["id"]: g["alignment_pct"] for g in r.goals if isinstance(g, dict) and "id" in g},
                )
            db.commit()
        except Exception:
            db.rollback()
            log.warning(
                "Weekly insights backfill failed for user=%s date=%s", user_id, report_date, exc_info=True,
            )
