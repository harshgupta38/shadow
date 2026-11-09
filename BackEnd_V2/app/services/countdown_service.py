"""Countdowns: dates the person is counting down to, with the tasks and notes that lead up to them.

A countdown owns no tasks or notes of its own. Its tasks are scheduled tasks that point at it, so they show on the Schedule page and
in the daily plan like any other; its notes are journal days tagged to it (see journal_service). Progress is time: from the day
counting started to the target date.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.common import today_ist
from app.core.exceptions import NotFoundError, ValidationError
from app.models.countdown import CountdownDBM, CountdownJournalLinkDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.user import UserDBM
from app.models.journal import JournalEntryDBM
from app.services import notifications_service
from app.services.journal_service import HAS_CONTENT
from app.schemas.countdown import (
    CountdownCreateRequest,
    CountdownDetailResponse,
    CountdownResponse,
    CountdownTaskResponse,
    CountdownUpdateRequest,
)

MAX_ACTIVE_COUNTDOWNS = 10  # more than this stops being a countdown and starts being a to-do list
NOTIFY_AT_DAYS_LEFT = (100, 50, 30, 14, 7, 3, 1, 0)  # the days that get a notification, the last stretch also as a push
PUSH_WITHIN_DAYS = 7


def _find(db: Session, user: UserDBM, countdown_id: int) -> CountdownDBM:
    countdown = db.scalar(select(CountdownDBM).where(CountdownDBM.id == countdown_id, CountdownDBM.user_id == user.id))
    if countdown is None:
        raise NotFoundError("Countdown not found.")
    return countdown


def timing(countdown: CountdownDBM, today: date) -> tuple[int, int, int]:
    """(days left, days in all, percent of the way there). Days left is negative once the date has passed."""
    days_left = (countdown.target_date - today).days
    total = max((countdown.target_date - countdown.start_date).days, 1)
    if countdown.status == "achieved" or days_left <= 0:
        return days_left, total, 100
    elapsed = (today - countdown.start_date).days
    return days_left, total, max(0, min(round(elapsed / total * 100), 99))  # 100 is kept for the day itself


def counts(db: Session, countdown_ids: list[int]) -> dict[int, dict[str, int]]:
    """Tasks and notes per countdown, in two queries however many countdowns there are."""
    result = {cid: {"tasks_total": 0, "tasks_done": 0, "notes_count": 0} for cid in countdown_ids}
    if not countdown_ids:
        return result
    for cid, total, done in db.execute(
        select(
            ScheduledTaskDBM.countdown_id,
            func.count(ScheduledTaskDBM.id),
            func.sum(case((ScheduledTaskDBM.status == "completed", 1), else_=0)),
        )
        .where(ScheduledTaskDBM.countdown_id.in_(countdown_ids))
        .group_by(ScheduledTaskDBM.countdown_id)
    ).all():
        result[cid]["tasks_total"], result[cid]["tasks_done"] = total, int(done or 0)
    for cid, notes in db.execute(
        select(CountdownJournalLinkDBM.countdown_id, func.count())
        .join(JournalEntryDBM, JournalEntryDBM.id == CountdownJournalLinkDBM.journal_entry_id)
        .where(CountdownJournalLinkDBM.countdown_id.in_(countdown_ids), HAS_CONTENT)
        .group_by(CountdownJournalLinkDBM.countdown_id)
    ).all():
        result[cid]["notes_count"] = notes
    return result


def _respond(countdown: CountdownDBM, today: date, tally: dict[str, int]) -> dict:
    days_left, total, progress = timing(countdown, today)
    return {
        "id": countdown.id,
        "title": countdown.title,
        "note": countdown.note,
        "emoji": countdown.emoji,
        "color": countdown.color,
        "start_date": countdown.start_date,
        "target_date": countdown.target_date,
        "status": countdown.status,
        "achieved_at": countdown.achieved_at,
        "days_left": days_left,
        "total_days": total,
        "progress_pct": progress,
        "created_at": countdown.created_at,
        **tally,
    }


def list_countdowns(db: Session, user: UserDBM) -> list[CountdownResponse]:
    """Active countdowns, the nearest first, then the achieved ones, the latest first."""
    rows = list(db.scalars(select(CountdownDBM).where(CountdownDBM.user_id == user.id)).all())
    rows.sort(key=lambda c: (0, c.target_date, c.id) if c.status == "active" else (1, -(c.achieved_at or datetime.min.replace(tzinfo=timezone.utc)).timestamp(), c.id))
    tallies = counts(db, [c.id for c in rows])
    today = today_ist()
    return [CountdownResponse(**_respond(c, today, tallies[c.id])) for c in rows]


def get_countdown(db: Session, user: UserDBM, countdown_id: int) -> CountdownDetailResponse:
    countdown = _find(db, user, countdown_id)
    tasks = db.scalars(
        select(ScheduledTaskDBM)
        .where(ScheduledTaskDBM.countdown_id == countdown.id, ScheduledTaskDBM.user_id == user.id)
        .order_by(ScheduledTaskDBM.scheduled_date, ScheduledTaskDBM.id)
    ).all()
    tally = counts(db, [countdown.id])[countdown.id]
    return CountdownDetailResponse(
        **_respond(countdown, today_ist(), tally),
        tasks=[CountdownTaskResponse(id=t.id, title=t.title, scheduled_date=t.scheduled_date, status=t.status, priority=t.priority) for t in tasks],
    )


def create_countdown(db: Session, user: UserDBM, data: CountdownCreateRequest) -> CountdownDetailResponse:
    today = today_ist()
    start = data.start_date or today
    if data.target_date < today:
        raise ValidationError(errors={"target_date": "The date to count down to can't be in the past."})
    if start > today:
        raise ValidationError(errors={"start_date": "Counting can't start in the future. Leave it empty to start today."})
    if start > data.target_date:
        raise ValidationError(errors={"start_date": "Counting has to start on or before the target date."})
    active = db.scalar(select(func.count()).select_from(CountdownDBM).where(CountdownDBM.user_id == user.id, CountdownDBM.status == "active")) or 0
    if active >= MAX_ACTIVE_COUNTDOWNS:
        raise ValidationError(errors={"title": f"You can count down to {MAX_ACTIVE_COUNTDOWNS} things at once. Finish or delete one first."})

    countdown = CountdownDBM(
        user_id=user.id,
        title=data.title,
        note=data.note.strip() if data.note and data.note.strip() else None,
        emoji=data.emoji,
        color=data.color,
        start_date=start,
        target_date=data.target_date,
    )
    db.add(countdown)
    db.commit()
    db.refresh(countdown)
    return get_countdown(db, user, countdown.id)


def update_countdown(db: Session, user: UserDBM, countdown_id: int, data: CountdownUpdateRequest) -> CountdownDetailResponse:
    countdown = _find(db, user, countdown_id)
    fields = data.model_fields_set
    today = today_ist()

    target = data.target_date if "target_date" in fields and data.target_date is not None else countdown.target_date
    start = data.start_date if "start_date" in fields and data.start_date is not None else countdown.start_date
    status = data.status if "status" in fields and data.status is not None else countdown.status
    # Checked before anything is assigned, so a rejected edit leaves the countdown as it was.
    if target != countdown.target_date and target < today and status == "active":
        raise ValidationError(errors={"target_date": "The date to count down to can't be in the past."})
    if start != countdown.start_date and start > today:
        raise ValidationError(errors={"start_date": "Counting can't start in the future."})
    if start > target:
        raise ValidationError(errors={"start_date": "Counting has to start on or before the target date."})
    if status == "active" and countdown.status == "achieved" and target < today:
        raise ValidationError(errors={"target_date": "That date has passed. Pick a new date to count down to."})

    if "title" in fields and data.title is not None:
        countdown.title = data.title
    if "note" in fields:
        countdown.note = data.note.strip() if data.note and data.note.strip() else None
    if "emoji" in fields and data.emoji is not None:
        countdown.emoji = data.emoji
    if "color" in fields and data.color is not None:
        countdown.color = data.color
    countdown.target_date, countdown.start_date = target, start
    if status != countdown.status:
        countdown.status = status
        countdown.achieved_at = datetime.now(timezone.utc) if status == "achieved" else None
    db.commit()
    return get_countdown(db, user, countdown.id)


def delete_countdown(db: Session, user: UserDBM, countdown_id: int) -> None:
    """Deletes the countdown and its tags. Its tasks stay in the schedule and its notes stay in the journal: only the link goes."""
    countdown = _find(db, user, countdown_id)
    db.delete(countdown)
    db.commit()


def _open_tasks_text(tally: dict[str, int]) -> str | None:
    total, done = tally["tasks_total"], tally["tasks_done"]
    if not total:
        return None
    return f"All {total} tasks are done." if done == total else f"{total - done} of {total} tasks still open."


def send_milestone_notifications(db: Session, users: dict[int, UserDBM], today: date) -> None:
    """Notifies each person on the days that mark their countdowns (100, 50, 30, 14, 7, 3 and 1 days to go, and the day itself),
    and once the day after to ask whether it happened. The last week also goes out as a push; the rest stays in the app. Meant to run
    once a day: each notification has a key of its own, so a repeat run does not send twice."""
    rows = db.scalars(
        select(CountdownDBM).where(
            CountdownDBM.user_id.in_(list(users)),
            CountdownDBM.status == "active",
            CountdownDBM.target_date >= today - timedelta(days=1),
            CountdownDBM.target_date <= today + timedelta(days=max(NOTIFY_AT_DAYS_LEFT)),
        )
    ).all()
    tallies = counts(db, [c.id for c in rows])
    for countdown in rows:
        days_left, _, progress = timing(countdown, today)
        user = users[countdown.user_id]
        tasks_text = _open_tasks_text(tallies[countdown.id])
        key = f"countdown:{countdown.id}:{countdown.target_date}:{days_left}"
        if days_left == -1:
            notifications_service.create_notification(
                db, user,
                title=f"Did it happen? {countdown.title}",
                body="Mark it as achieved to keep its notes and memories together.",
                type="reminder", level=notifications_service.LEVEL_INFORMATIONAL, url="/journal", event_key=key, push=False,
            )
        elif days_left == 0:
            counted = (countdown.target_date - countdown.start_date).days
            notifications_service.create_notification(
                db, user,
                title=f"{countdown.emoji} Today's the day: {countdown.title}",
                body=f"You counted down {counted} day{'s' if counted != 1 else ''} to get here. Enjoy it!" if counted else "Enjoy it!",
                type="reminder", level=notifications_service.LEVEL_ACHIEVEMENT, url="/journal", event_key=key,
            )
        elif days_left in NOTIFY_AT_DAYS_LEFT:
            title = f"{countdown.emoji} {countdown.title} is tomorrow" if days_left == 1 else f"{countdown.emoji} {days_left} days to {countdown.title}"
            body = " ".join(part for part in (f"{progress}% of the way there." if days_left > PUSH_WITHIN_DAYS else None, tasks_text) if part) or None
            notifications_service.create_notification(
                db, user,
                title=title, body=body, type="reminder", level=notifications_service.LEVEL_INFORMATIONAL, url="/journal",
                event_key=key, push=days_left <= PUSH_WITHIN_DAYS,
            )
