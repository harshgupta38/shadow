"""Reminders for a workout day that is still waiting.

When the plan someone follows has a workout today and none is done or under way, they get in-app reminders through the day and one push
at a time that suits them. The push time comes from their own history: the median time of day their recent workouts started, less a
short lead, kept out of their quiet hours. Without enough history it is a default evening time.

Every reminder looks at the day again when it is due, so a workout done in the morning stops the rest, and a rest day has none.
"""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common import to_ist
from app.db.session import SessionLocal
from app.models.user import UserDBM
from app.models.workout_session import WorkoutSessionDBM
from app.models.workout_setting import WorkoutSettingDBM
from app.schemas.workout import WorkoutOverviewResponse
from app.services import notifications_service, settings_service, workout_insights_service

# In-app reminders: minutes after midnight IST. They stay in the app; only the push below reaches a phone.
NUDGE_SLOTS = {"morning": 9 * 60, "afternoon": 14 * 60, "evening": 19 * 60}

DEFAULT_PUSH_MINUTE = 18 * 60  # for someone with too little history to learn from
PUSH_LEAD_MINUTES = 30  # the push comes this long before the usual start
EARLIEST_PUSH_MINUTE = 5 * 60
LATEST_PUSH_MINUTE = 22 * 60 + 30
MIN_HISTORY = 3  # completed workouts needed before their times are trusted
HISTORY_SESSIONS = 12  # the most recent ones count, so a changed routine is followed
HISTORY_DAYS = 90
DAY_STARTS_AT = 3 * 60  # times are measured from here, so a workout just after midnight sits next to one just before it
WINDOW_MINUTES = 2  # a reminder is due for this many minutes from its time, like the scheduler's other jobs

_push_minutes: dict[int, tuple[date, int]] = {}  # per person, for the day: the history changes slowly, so it is read once a day


def _minutes_of(hhmm: str) -> int | None:
    try:
        hours, minutes = map(int, hhmm.split(":"))
    except (ValueError, AttributeError):
        return None
    return hours * 60 + minutes if 0 <= hours <= 23 and 0 <= minutes <= 59 else None


def usual_start_minute(db: Session, user_id: int, today: date) -> int | None:
    """The median time of day, in minutes after midnight IST, that the person's recent workouts started. None when there are too few."""
    started = db.scalars(
        select(WorkoutSessionDBM.started_at)
        .where(
            WorkoutSessionDBM.user_id == user_id,
            WorkoutSessionDBM.status == "completed",
            WorkoutSessionDBM.session_date >= today - timedelta(days=HISTORY_DAYS),
        )
        .order_by(WorkoutSessionDBM.started_at.desc())
        .limit(HISTORY_SESSIONS)
    ).all()
    if len(started) < MIN_HISTORY:
        return None
    times = sorted((to_ist(moment).hour * 60 + to_ist(moment).minute - DAY_STARTS_AT) % 1440 for moment in started)
    middle = len(times) // 2
    median = times[middle] if len(times) % 2 else (times[middle - 1] + times[middle]) // 2
    return (median + DAY_STARTS_AT) % 1440


def _outside_quiet_hours(minute: int, quiet: dict) -> int:
    """`minute`, or the nearer edge of the person's quiet hours when it falls inside them (a push there would be dropped)."""
    start, end = _minutes_of(quiet["start"]), _minutes_of(quiet["end"])
    if not quiet["enabled"] or start is None or end is None or start == end:
        return minute
    inside = start <= minute < end if start < end else minute >= start or minute < end
    if not inside:
        return minute
    after = (end - minute) % 1440  # minutes until the quiet hours end
    before = (minute - start) % 1440  # minutes since they began
    return end if after <= before else max(EARLIEST_PUSH_MINUTE, start - 15)


def push_minute(db: Session, user_id: int, today: date) -> int:
    """When the day's push is due for this person, in minutes after midnight IST."""
    usual = usual_start_minute(db, user_id, today)
    if usual is None:
        minute = DEFAULT_PUSH_MINUTE
    else:
        minute = round((usual - PUSH_LEAD_MINUTES) / 5) * 5
        minute = min(max(minute, EARLIEST_PUSH_MINUTE), LATEST_PUSH_MINUTE)
    return _outside_quiet_hours(minute, settings_service.get_quiet_hours(db, user_id))


def _push_minute_today(db: Session, user_id: int, today: date) -> int:
    cached = _push_minutes.get(user_id)
    if cached is None or cached[0] != today:
        cached = (today, push_minute(db, user_id, today))
        _push_minutes[user_id] = cached
    return cached[1]


def _plan_followers(db: Session) -> list[UserDBM]:
    return list(
        db.scalars(
            select(UserDBM).join(WorkoutSettingDBM, WorkoutSettingDBM.user_id == UserDBM.id).where(WorkoutSettingDBM.active_plan_id.is_not(None))
        ).all()
    )


def _waiting_workout(db: Session, user: UserDBM) -> WorkoutOverviewResponse | None:
    """Today's overview when the plan has a workout today that is neither done nor under way, otherwise None."""
    overview = workout_insights_service.overview(db, user)
    if overview.today_plan_day is None or overview.completed_today is not None or overview.in_progress_session_id is not None:
        return None
    return overview


def _nudge_text(slot: str, name: str, exercises: int, minutes: int) -> tuple[str, str]:
    detail = f"{exercises} exercise{'s' if exercises != 1 else ''} · about {minutes} min"
    if slot == "morning":
        return f"Workout day: {name}", f"{detail}. Pick a window for it today."
    if slot == "afternoon":
        return f"{name} is still on your list", f"{detail}. A short window is enough."
    return f"Still time for {name} today", f"{detail}. Do it tonight and your week stays on track."


def send_nudges(today: date, slot: str) -> None:
    """The in-app reminder of one slot, for everyone whose workout is still waiting. Skipped within an hour of the person's push."""
    with SessionLocal() as db:
        for user in _plan_followers(db):
            overview = _waiting_workout(db, user)
            if overview is None or abs(NUDGE_SLOTS[slot] - _push_minute_today(db, user.id, today)) < 60:
                continue
            day = overview.today_plan_day
            title, body = _nudge_text(slot, day.name, len(day.exercises), day.estimated_minutes)
            notifications_service.create_notification(
                db, user,
                title=title,
                body=body,
                type="reminder",
                level=notifications_service.LEVEL_REMINDER,
                url="/workout",
                event_key=f"workout_nudge:{user.id}:{today}:{slot}",
                push=False,
            )


def send_due_pushes(today: date, now_minutes: int) -> None:
    """The day's push, for everyone whose time it is now and whose workout is still waiting."""
    with SessionLocal() as db:
        for user in _plan_followers(db):
            due = _push_minute_today(db, user.id, today)
            if not due <= now_minutes < due + WINDOW_MINUTES:
                continue
            overview = _waiting_workout(db, user)
            if overview is None:
                continue
            day = overview.today_plan_day
            notifications_service.create_notification(
                db, user,
                title=f"Time for your workout: {day.name}",
                body=f"{len(day.exercises)} exercise{'s' if len(day.exercises) != 1 else ''} · about {day.estimated_minutes} min. Tap to start.",
                type="reminder",
                level=notifications_service.LEVEL_REMINDER,
                url="/workout",
                event_key=f"workout_push:{user.id}:{today}",
            )
