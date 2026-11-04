"""Tools for the Workout Coach: read the user's training and plans, look exercises up, and propose a new plan.

Every tool returns a dict and never raises: an exception inside a tool fails the whole chat request, whereas an {"error": ...} result
lets the model correct itself. Nothing here writes user data: the plan proposal is only a draft that the user reviews, edits and
saves from the chat. The tools only read arguments and shape results; the work is done by the workout services, and the schemas the
model sees are in workout_definitions.py.
"""

from collections import defaultdict
from datetime import date, timedelta
from enum import StrEnum
from functools import wraps
from typing import Callable, get_args

from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.common import today_ist
from app.core.exceptions import AppError
from app.llm.tools.context import ToolContext
from app.llm.tools.workout_definitions import (
    DEFAULT_BALANCE_DAYS,
    DEFAULT_HISTORY_DAYS,
    DEFAULT_PROGRESS_SESSIONS,
    DEFAULT_SEARCH_RESULTS,
    MAX_HISTORY_DAYS,
    MAX_PROGRESS_SESSIONS,
    MAX_SEARCH_RESULTS,
    MIN_BALANCE_DAYS,
)
from app.models.workout_exercise import WorkoutExerciseDBM
from app.models.workout_session import WorkoutSessionDBM
from app.models.workout_session_exercise import WorkoutSessionExerciseDBM
from app.schemas.weekly_insights import WEEKDAYS_LONG
from app.schemas.workout import MuscleId, PlanDraftInput
from app.services import (
    workout_insights_service,
    workout_library_service,
    workout_plan_builder_service,
    workout_plans_service,
    workout_sessions_service,
)
from app.services.workout_calc_service import clamp_int, estimated_one_rep_max, plan_adherence, strength_trend, sunday_based_weekday

_MUSCLES = get_args(MuscleId)
_MAX_HISTORY_SESSIONS = 60


def _safe(tool: Callable) -> Callable:
    """Turns any error inside a tool into a result the model can read, because a raised error would fail the whole request."""

    @wraps(tool)
    def run(context: ToolContext, arguments: dict) -> dict:
        try:
            return tool(context, arguments)
        except AppError as exc:
            return {"error": getattr(exc, "detail", None) or str(exc) or "That could not be done."}
        except PydanticValidationError as exc:
            problems = "; ".join(f"{'.'.join(str(p) for p in error['loc'])}: {error['msg']}" for error in exc.errors()[:5])
            return {"error": f"The request was not valid. {problems}"}
        except (ValueError, KeyError, TypeError) as exc:
            return {"error": f"The request could not be understood: {exc}"}

    return run


# ── Shaping results ──────────────────────────────────────────────────────────


def _dose_text(measure: str, sets: int, reps: str) -> str:
    """A timed block reads as the time alone; anything else as sets × dose."""
    return reps if measure == "minutes" else f"{sets} × {reps}"


def _kg(value: float) -> str:
    return f"{value:g} kg"


def _weekday_name(day: date) -> str:
    return WEEKDAYS_LONG[sunday_based_weekday(day)]


def _minutes(session: WorkoutSessionDBM, now) -> int:
    return int(workout_sessions_service.duration_seconds(session, now) / 60 + 0.5)


def _set_text(exercise: WorkoutExerciseDBM, entry: dict) -> str:
    if exercise.kind != "strength" or exercise.measure == "minutes":
        return "done"
    if exercise.measure == "seconds":
        return f"{entry['seconds']} sec" if entry.get("seconds") else "done"
    reps, weight = entry.get("reps"), entry.get("weight_kg")
    if reps is None:
        return "done"
    return f"{_kg(weight)} × {reps}" if weight else f"bodyweight × {reps}"


def _exercise_row(entry: WorkoutSessionExerciseDBM) -> dict:
    done = [s for s in entry.sets if s.get("done")]
    return {
        "exercise": entry.exercise.name,
        "kind": entry.exercise.kind,
        "target": _dose_text(entry.exercise.measure, entry.target_sets, entry.target_reps),
        "sets_done": len(done),
        "sets_planned": len(entry.sets),
        "sets": [_set_text(entry.exercise, s) for s in done],
        **({"note": entry.note} if entry.note else {}),
    }


def _no_exercise(exercise_id, name) -> dict:
    which = f"id {exercise_id}" if exercise_id is not None else f"'{name}'"
    return {"error": f"No exercise matches {which}. Use search_exercises to find the right one."}


# ── Reading the user's training ──────────────────────────────────────────────


@_safe
def get_workout_overview(context: ToolContext, arguments: dict) -> dict:
    db, user = context.db, context.current_user
    overview = workout_insights_service.overview(db, user)
    result: dict = {
        "today": overview.today_date.isoformat(),
        "weekday": _weekday_name(overview.today_date),
        "has_active_plan": overview.active_plan is not None,
    }
    plan = overview.active_plan
    if plan is not None:
        started = workout_plans_service.active_plan_started_on(db, user.id)
        result["active_plan"] = {
            "id": plan.id,
            "name": plan.name,
            "goal": plan.goal.replace("_", " "),
            "level": plan.level,
            "training_days": [WEEKDAYS_LONG[w] for w in plan.weekdays],
            "average_session_minutes": plan.avg_minutes,
            "following_since": started.isoformat() if started else None,
        }
    else:
        result["message"] = "The user is not following a plan right now."

    day = overview.today_plan_day
    if day is not None:
        result["todays_planned_workout"] = {
            "name": day.name,
            "estimated_minutes": day.estimated_minutes,
            "exercises": [f"{e.exercise.name}: {_dose_text(e.exercise.measure, e.sets, e.reps)}" for e in day.exercises],
        }
        if plan is not None:
            routine = workout_plans_service.day_warm_up_routine(db, user, plan.id, day.weekday)
            result["todays_warm_up"] = [f"{item.exercise.name}: {item.reps if item.sets == 1 else f'{item.sets} × {item.reps}'}" for item in routine.items]
    elif overview.is_rest_day:
        result["todays_planned_workout"] = "Rest day: nothing is planned today."
    result["workout_in_progress_now"] = overview.in_progress_session_id is not None
    if overview.completed_today is not None:
        done = overview.completed_today
        result["completed_today"] = {"name": done.name, "minutes": round(done.duration_seconds / 60), "sets_done": done.sets_done, "volume_kg": done.volume_kg}

    result["this_week"] = {
        "sessions_done": overview.sessions_this_week,
        "sessions_planned": overview.sessions_target,
        "volume_kg": overview.volume_kg_week,
        "minutes_trained": overview.minutes_week,
        "days": [
            {"date": d.date.isoformat(), "weekday": WEEKDAYS_LONG[d.weekday], "status": d.status, **({"workout": d.label} if d.label else {})}
            for d in overview.week
        ],
        "muscles_trained": [{"muscle": m.muscle, "weighted_sets": m.sets} for m in overview.muscles_this_week[:8]],
    }
    result["consistency"] = {"streak_weeks": overview.streak_weeks, "total_workouts_ever": overview.total_sessions}
    return result


@_safe
def get_workout_history(context: ToolContext, arguments: dict) -> dict:
    db, user = context.db, context.current_user
    days = clamp_int(arguments.get("days"), 1, MAX_HISTORY_DAYS, DEFAULT_HISTORY_DAYS)
    include_exercises = bool(arguments.get("include_exercises"))
    end = today_ist()
    start = end - timedelta(days=days - 1)

    query = (
        select(WorkoutSessionDBM)
        .where(
            WorkoutSessionDBM.user_id == user.id,
            WorkoutSessionDBM.status == "completed",
            WorkoutSessionDBM.session_date >= start,
            WorkoutSessionDBM.session_date <= end,
        )
        .order_by(WorkoutSessionDBM.session_date.desc(), WorkoutSessionDBM.started_at.desc())
        .limit(_MAX_HISTORY_SESSIONS + 1)
    )
    if include_exercises:
        query = query.options(selectinload(WorkoutSessionDBM.exercises))
    sessions = list(db.scalars(query).all())
    truncated = len(sessions) > _MAX_HISTORY_SESSIONS
    sessions = sessions[:_MAX_HISTORY_SESSIONS]

    now = workout_sessions_service.now_utc()
    rows = []
    for session in sessions:
        row: dict = {
            "session_id": session.id,
            "date": session.session_date.isoformat(),
            "weekday": _weekday_name(session.session_date),
            "name": session.name,
            "plan": session.plan_name or "freestyle",
            "minutes": _minutes(session, now),
            "exercises": session.exercise_count,
            "sets_done": session.sets_done,
            "volume_kg": session.volume_kg,
            "main_muscles": session.muscles[:5],
        }
        if session.note:
            row["note"] = session.note
        if include_exercises:
            row["exercise_details"] = [_exercise_row(entry) for entry in session.exercises if any(s.get("done") for s in entry.sets)]
        rows.append(row)

    last_day = db.scalar(
        select(func.max(WorkoutSessionDBM.session_date)).where(WorkoutSessionDBM.user_id == user.id, WorkoutSessionDBM.status == "completed")
    )
    result: dict = {
        "today": end.isoformat(),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "days_in_range": days,
        "workouts_in_range": len(rows),
        "workouts_per_week": round(len(rows) / (days / 7), 1),
        "total_volume_kg": round(sum(r["volume_kg"] for r in rows), 1),
        "total_minutes": sum(r["minutes"] for r in rows),
        "last_workout": last_day.isoformat() if last_day else None,
        "days_since_last_workout": (end - last_day).days if last_day else None,
    }

    # How closely the user stuck to the plan they follow, over the days of this range that are over.
    plan = workout_plans_service.active_plan(db, user)
    if plan is not None:
        started_on = workout_plans_service.active_plan_started_on(db, user.id)
        planned, trained = plan_adherence(
            {d.weekday for d in plan.days},
            {s.session_date for s in sessions},
            max(start, started_on) if started_on else start,
            end,
        )
        if planned:
            result["plan_adherence"] = {"plan": plan.name, "planned_days": planned, "trained_on_planned_days": trained, "percent": round(100 * trained / planned)}

    result["workouts"] = rows
    if truncated:
        result["note"] = f"Only the {_MAX_HISTORY_SESSIONS} most recent workouts are listed; the totals above cover just those."
    if not rows:
        result["message"] = "No completed workouts were logged in this period."
    return result


@_safe
def get_workout_session(context: ToolContext, arguments: dict) -> dict:
    session = context.db.scalar(
        select(WorkoutSessionDBM)
        .where(WorkoutSessionDBM.id == int(arguments["session_id"]), WorkoutSessionDBM.user_id == context.current_user.id)
        .options(selectinload(WorkoutSessionDBM.exercises))
    )
    if session is None:
        return {"error": "That workout was not found. Use get_workout_history to find the right session_id."}
    return {
        "session_id": session.id,
        "date": session.session_date.isoformat(),
        "weekday": _weekday_name(session.session_date),
        "name": session.name,
        "plan": session.plan_name or "freestyle",
        "status": session.status,
        "minutes": _minutes(session, workout_sessions_service.now_utc()),
        "sets_done": session.sets_done,
        "volume_kg": session.volume_kg,
        "note": session.note,
        "exercises": [_exercise_row(entry) for entry in session.exercises],
    }


@_safe
def get_exercise_progress(context: ToolContext, arguments: dict) -> dict:
    db, user = context.db, context.current_user
    exercise, alternatives = workout_library_service.find_exercise(db, arguments.get("exercise_id"), arguments.get("exercise_name"))
    if exercise is None:
        return _no_exercise(arguments.get("exercise_id"), arguments.get("exercise_name"))
    limit = clamp_int(arguments.get("sessions"), 1, MAX_PROGRESS_SESSIONS, DEFAULT_PROGRESS_SESSIONS)

    rows = db.execute(
        select(WorkoutSessionExerciseDBM.sets, WorkoutSessionDBM.session_date)
        .join(WorkoutSessionDBM, WorkoutSessionDBM.id == WorkoutSessionExerciseDBM.session_id)
        .where(
            WorkoutSessionDBM.user_id == user.id,
            WorkoutSessionDBM.status == "completed",
            WorkoutSessionExerciseDBM.exercise_id == exercise.id,
        )
        .order_by(WorkoutSessionDBM.session_date.desc(), WorkoutSessionDBM.started_at.desc())
        .limit(limit * 2)  # entries without a finished set are skipped below
    ).all()

    counted_in_reps = exercise.kind == "strength" and exercise.measure == "reps"
    entries = []
    for sets, day in rows:
        done = [s for s in sets if s.get("done")]
        if not done:
            continue
        entry: dict = {"date": day.isoformat(), "sets_done": len(done)}
        if counted_in_reps:
            best = max(done, key=lambda s: (s.get("weight_kg") or 0, s.get("reps") or 0))
            weight, reps = best.get("weight_kg") or 0, best.get("reps") or 0
            entry.update(
                {
                    "sets": [_set_text(exercise, s) for s in done],
                    "top_set": _set_text(exercise, best),
                    "volume_kg": round(sum((s.get("weight_kg") or 0) * (s.get("reps") or 0) for s in done), 1),
                    "_top_weight": weight,
                    "_top_reps": reps,
                    "_score": estimated_one_rep_max(weight, reps),
                }
            )
        elif exercise.kind == "strength" and exercise.measure == "seconds":
            longest = max((s.get("seconds") or 0) for s in done)
            entry.update({"sets": [_set_text(exercise, s) for s in done], "longest_hold_seconds": longest, "_score": float(longest) or None})
        entries.append(entry)
        if len(entries) == limit:
            break

    if not entries:
        return {"exercise": exercise.name, "sessions_found": 0, "message": "The user has not logged a finished set of this exercise yet."}

    trend = strength_trend([e["_score"] for e in reversed(entries) if e.get("_score")])  # oldest first
    result: dict = {
        "exercise": exercise.name,
        "measure": exercise.measure,
        "sessions_found": len(entries),
        "first_date": entries[-1]["date"],
        "latest_date": entries[0]["date"],
        "sessions_newest_first": [{k: v for k, v in e.items() if not k.startswith("_")} for e in entries],
    }
    if trend:  # left out when there are too few sessions, so there is nothing for the model to quote
        result["trend"] = trend
    if counted_in_reps:
        best_entry = max(entries, key=lambda e: (e["_top_weight"], e["_top_reps"]))
        result["best_set_ever_in_these_sessions"] = {"set": best_entry["top_set"], "date": best_entry["date"]}
        result["top_weight_first_session"] = entries[-1]["_top_weight"]
        result["top_weight_latest_session"] = entries[0]["_top_weight"]
        result["top_weight_change_kg"] = round(entries[0]["_top_weight"] - entries[-1]["_top_weight"], 1)
        if entries[0].get("_score"):
            result["estimated_one_rep_max_latest_kg"] = entries[0]["_score"]
    if alternatives:
        result["other_exercises_with_a_similar_name"] = alternatives
    return result


@_safe
def get_training_balance(context: ToolContext, arguments: dict) -> dict:
    days = clamp_int(arguments.get("days"), MIN_BALANCE_DAYS, MAX_HISTORY_DAYS, DEFAULT_BALANCE_DAYS)
    start = today_ist() - timedelta(days=days - 1)
    sessions = context.db.execute(
        select(WorkoutSessionDBM.muscle_sets, WorkoutSessionDBM.muscles).where(
            WorkoutSessionDBM.user_id == context.current_user.id,
            WorkoutSessionDBM.status == "completed",
            WorkoutSessionDBM.session_date >= start,
        )
    ).all()
    if not sessions:
        return {"days_looked_at": days, "workouts": 0, "message": "No completed workouts in this period."}

    sets: defaultdict[str, float] = defaultdict(float)
    frequency: defaultdict[str, int] = defaultdict(int)
    for muscle_sets, muscles in sessions:
        for muscle, value in muscle_sets.items():
            sets[muscle] += value
        for muscle in muscles:
            frequency[muscle] += 1

    trained = sorted(sets, key=lambda m: sets[m], reverse=True)
    weeks = days / 7
    return {
        "days_looked_at": days,
        "workouts": len(sessions),
        "weighted_sets_by_muscle": {m: round(sets[m], 1) for m in trained},
        "average_weekly_sets_by_muscle": {m: round(sets[m] / weeks, 1) for m in trained},
        "workouts_that_trained_each_muscle_as_a_main_target": {m: frequency[m] for m in sorted(frequency, key=lambda m: -frequency[m])},
        "not_trained_at_all": [m for m in _MUSCLES if m not in sets],
        "most_trained": trained[:3],
        "least_trained_of_those_worked": trained[-3:] if len(trained) > 3 else [],
        "note": "Weighted sets count a set fully for each main muscle and half for each helping muscle. Cardio and warm-ups are not counted.",
    }


# ── Plans and the exercise library ───────────────────────────────────────────


def _plan_list(context: ToolContext) -> dict:
    plans = workout_plans_service.list_plans(context.db, context.current_user, None)
    return {
        "plans": [
            {
                "id": p.id,
                "name": p.name,
                "source": "ready-made" if p.source == "predefined" else "the user's own",
                "followed_now": p.is_active,
                "goal": p.goal.replace("_", " "),
                "level": p.level,
                "days_per_week": p.days_per_week,
                "training_days": [WEEKDAYS_LONG[w] for w in p.weekdays],
                "average_session_minutes": p.avg_minutes,
                "main_muscles": p.muscles,
                "equipment": p.equipment,
            }
            for p in plans
        ]
    }


def _plan_detail(context: ToolContext, plan_id: int) -> dict:
    plan = workout_plans_service.get_plan(context.db, context.current_user, plan_id)
    return {
        "id": plan.id,
        "name": plan.name,
        "description": plan.description,
        "goal": plan.goal.replace("_", " "),
        "level": plan.level,
        "followed_now": plan.is_active,
        "days": [
            {
                "weekday": WEEKDAYS_LONG[d.weekday],
                "weekday_number": d.weekday,
                "name": d.name,
                "estimated_minutes": d.estimated_minutes,
                "exercises": [
                    {
                        "exercise_id": e.exercise.id,
                        "exercise": e.exercise.name,
                        "dose": _dose_text(e.exercise.measure, e.sets, e.reps),
                        "rest_seconds": e.rest_seconds,
                        "weight_kg": e.weight_kg,
                        "main_muscles": e.exercise.primary_muscles,
                        **({"note": e.note} if e.note else {}),
                    }
                    for e in d.exercises
                ],
            }
            for d in plan.days
        ],
    }


@_safe
def get_workout_plans(context: ToolContext, arguments: dict) -> dict:
    """Every plan the user can use, or one plan in full when a plan_id is given."""
    if arguments.get("plan_id") is not None:
        return _plan_detail(context, int(arguments["plan_id"]))
    return _plan_list(context)


def _exercise_entry(row: WorkoutExerciseDBM) -> dict:
    # Kept small on purpose: every result is sent back to the model on each later step of the conversation.
    return {
        "exercise_id": row.id,
        "name": row.name,
        "equipment": row.equipment,
        "mechanic": row.mechanic,
        "measure": row.measure,
        "usual_dose": _dose_text(row.measure, row.default_sets, row.default_reps),
    }


@_safe
def search_exercises(context: ToolContext, arguments: dict) -> dict:
    limit = clamp_int(arguments.get("limit"), 1, MAX_SEARCH_RESULTS, DEFAULT_SEARCH_RESULTS)
    muscles = [m for m in (arguments.get("muscles") or []) if m in _MUSCLES]
    matches = workout_library_service.search_exercises(
        context.db,
        query=arguments.get("query"),
        muscles=muscles,
        equipment_type=arguments.get("equipment_type"),
        kind=arguments.get("kind") or "strength",
        max_level=arguments.get("max_level"),
    )
    if not muscles:
        return {"found": len(matches), "exercises": [_exercise_entry(row) for row in matches[:limit]]}

    # One group per muscle asked for, best first. An exercise that trains two of them appears under the first it matches.
    groups: dict[str, list[dict]] = {}
    shown: set[int] = set()
    for muscle in muscles:
        group = [row for row in matches if muscle in row.primary_muscles and row.id not in shown][:limit]
        shown.update(row.id for row in group)
        groups[muscle] = [_exercise_entry(row) for row in group]
    return {"by_muscle": groups}


@_safe
def get_exercise_details(context: ToolContext, arguments: dict) -> dict:
    db, user = context.db, context.current_user
    found, alternatives = workout_library_service.find_exercise(db, arguments.get("exercise_id"), arguments.get("exercise_name"))
    if found is None:
        return _no_exercise(arguments.get("exercise_id"), arguments.get("exercise_name"))
    detail = workout_library_service.get_exercise(db, user.id, found.id)
    last = detail.last_performance
    result: dict = {
        "exercise_id": detail.id,
        "name": detail.name,
        "kind": detail.kind,
        "level": detail.level,
        "equipment": detail.equipment,
        "mechanic": detail.mechanic,
        "main_muscles": detail.primary_muscles,
        "helping_muscles": detail.secondary_muscles,
        "description": detail.description,
        "how_to_do_it": detail.instructions,
        "tips": detail.tips,
        "common_mistakes": detail.common_mistakes,
        "good_warm_ups": [w.name for w in detail.warm_up_with],
        "users_last_performance": (
            {"date": last.date.isoformat(), "best_set": f"{_kg(last.weight_kg)} × {last.reps}" if last.weight_kg and last.reps else "logged", "sets": last.sets}
            if last
            else "The user has not logged this exercise yet."
        ),
    }
    if alternatives:
        result["other_exercises_with_a_similar_name"] = alternatives
    return result


# ── Proposing a plan ─────────────────────────────────────────────────────────


def _plan_reply(built: workout_plan_builder_service.BuiltPlan, summary: str) -> str:
    """What the user is told. It is written here rather than by another model call: the plan card carries the detail, and a second
    call would only repeat it."""
    plan = built.plan
    lines = [f"I've drafted **{plan.name}**, {len(plan.days)} days a week:", ""]
    lines += [f"- **{WEEKDAYS_LONG[d.weekday][:3]}** · {d.name} ({len(d.exercises)} exercise{'s' if len(d.exercises) != 1 else ''})" for d in plan.days]
    if summary:
        lines += ["", summary]
    if built.notes:
        lines += ["", *[f"Note: {note}" for note in built.notes[:3]]]
    lines += [
        "",
        "Open the plan below to review it, change anything and save it, or tell me what you'd like different. "
        "If you have any injuries or pain, let me know and I'll adjust it.",
    ]
    return "\n".join(lines)


@_safe
def create_workout_plan_proposal(context: ToolContext, arguments: dict) -> dict:
    draft = PlanDraftInput.model_validate(arguments)
    built = workout_plan_builder_service.build_plan(context.db, draft)
    plan = built.plan

    proposal = plan.model_dump(mode="json")
    proposal["rationale"] = built.rationale
    context.action_data = {**(context.action_data or {}), "workout_plan_proposal": proposal}

    result: dict = {
        "status": "done",
        "final_reply": _plan_reply(built, (plan.description or built.rationale)[:400]),
        "message": (
            "The plan is ready and shown to the user as a card they open in a review panel to edit and save. It is NOT saved, so never say "
            "it was. Reply in 3 to 5 short lines using the exercises below: the schedule, the idea behind the split, one or two choices "
            "for their goal, and that they can ask for changes here or edit it in the panel."
        ),
        # The model never saw the exercises the app chose, so they come back here for it to describe the plan accurately.
        "plan": {
            "name": plan.name,
            "days": [
                {
                    "weekday": WEEKDAYS_LONG[d.weekday],
                    "name": d.name,
                    "exercises": [f"{built.exercises[e.exercise_id].name} {_dose_text(built.exercises[e.exercise_id].measure, e.sets, e.reps)}" for e in d.exercises],
                }
                for d in plan.days
            ],
        },
    }
    if built.notes:
        result["notes"] = built.notes
    return result


# ── Registry ─────────────────────────────────────────────────────────────────


class WorkoutToolsEnum(StrEnum):
    GET_WORKOUT_OVERVIEW = "get_workout_overview"
    GET_WORKOUT_HISTORY = "get_workout_history"
    GET_WORKOUT_SESSION = "get_workout_session"
    GET_EXERCISE_PROGRESS = "get_exercise_progress"
    GET_TRAINING_BALANCE = "get_training_balance"
    GET_WORKOUT_PLANS = "get_workout_plans"
    SEARCH_EXERCISES = "search_exercises"
    GET_EXERCISE_DETAILS = "get_exercise_details"
    CREATE_WORKOUT_PLAN_PROPOSAL = "create_workout_plan_proposal"


WORKOUT_TOOLS: dict[str, Callable] = {
    WorkoutToolsEnum.GET_WORKOUT_OVERVIEW: get_workout_overview,
    WorkoutToolsEnum.GET_WORKOUT_HISTORY: get_workout_history,
    WorkoutToolsEnum.GET_WORKOUT_SESSION: get_workout_session,
    WorkoutToolsEnum.GET_EXERCISE_PROGRESS: get_exercise_progress,
    WorkoutToolsEnum.GET_TRAINING_BALANCE: get_training_balance,
    WorkoutToolsEnum.GET_WORKOUT_PLANS: get_workout_plans,
    WorkoutToolsEnum.SEARCH_EXERCISES: search_exercises,
    WorkoutToolsEnum.GET_EXERCISE_DETAILS: get_exercise_details,
    WorkoutToolsEnum.CREATE_WORKOUT_PLAN_PROPOSAL: create_workout_plan_proposal,
}
