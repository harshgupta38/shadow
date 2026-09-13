"""
Notification scheduler — fires time-based and daily-batch notifications.

Jobs:
  08:00 IST  morning_jobs (global):
    #5  Goals due in 3 days
    #7  Milestones due in 3 days
    #13 Scheduled-task reminders (tasks with specific_time within next 30 min)

  user's default_reminder_time  reminder_jobs (per-user, default 21:00 IST):
    #9  Tasks due today (via parent milestone target_date)
    #10 Tasks overdue (yesterday's milestone deadline, still incomplete)

  21:00 IST  evening_jobs (global):
    #4  End-of-day plan completion reminder (< 50 % done)
    #12 Habits not yet logged today (streak-at-risk)

Deduplication: all notifications pass a stable event_key to create_notification(),
which skips the insert if (user_id, event_key) already exists in the table.

Query strategy: batch jobs load all active users once and issue one cross-user
query per notification type. Per-user reminder jobs fire only for users whose
configured reminder time matches the current IST minute.
"""

import asyncio
import logging
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import case, func, select

from app.common import now_ist
from app.common.proc_lock import acquire_singleton_lock
from app.db.session import SessionLocal
from app.models.goal import GoalDBM
from app.models.milestone import MilestoneDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.models.user_setting import UserSettingDBM
from app.services import notifications_service

_DEFAULT_REMINDER_TIME = "21:00"


def _hhmm_in_window(hhmm: str, now_minutes: int) -> bool:
    """True when now_minutes falls in the 2-minute window starting at hhmm."""
    try:
        h, m = map(int, hhmm.split(":"))
        if not (0 <= h <= 23 and 0 <= m <= 59):
            return False
        target = h * 60 + m
        return target <= now_minutes < target + 2
    except (ValueError, AttributeError):
        return False


def _get_reminder_times(db, user_ids: list[int]) -> dict[int, str]:
    """Returns {user_id: "HH:MM"} for each user, falling back to the default."""
    times = {uid: _DEFAULT_REMINDER_TIME for uid in user_ids}
    for row in db.execute(
        select(UserSettingDBM.user_id, UserSettingDBM.planner).where(
            UserSettingDBM.user_id.in_(user_ids)
        )
    ).all():
        if row.planner:
            t = row.planner.get("default_reminder_time", _DEFAULT_REMINDER_TIME)
            times[row.user_id] = str(t)
    return times

log = logging.getLogger("uvicorn.error")


def _active_users(db) -> dict[int, UserDBM]:
    """Returns {user_id: user} for all users."""
    return {u.id: u for u in db.scalars(select(UserDBM)).all()}


# ── Morning jobs (08:00 IST) ──────────────────────────────────────────────────

def _morning_jobs(today: date) -> None:
    three_days = today + timedelta(days=3)
    current_ist_time = now_ist()

    with SessionLocal() as db:
        users = _active_users(db)
        if not users:
            return
        user_ids = list(users.keys())

        # #5 — Goals due in 3 days (one query across all users)
        for goal in db.scalars(
            select(GoalDBM).where(
                GoalDBM.user_id.in_(user_ids),
                GoalDBM.status == "Active",
                GoalDBM.target_date == three_days,
            )
        ).all():
            notifications_service.create_notification(
                db, users[goal.user_id],
                title=f"Goal due in 3 days: {goal.title}",
                body="Review your progress and plan your final push.",
                url="/goals",
                event_key=f"goal_due3:{goal.id}:{today}",
            )

        # #7 — Milestones due in 3 days (one query across all users)
        for ms in db.scalars(
            select(MilestoneDBM).where(
                MilestoneDBM.user_id.in_(user_ids),
                MilestoneDBM.status.in_(["Not Started", "In Progress"]),
                MilestoneDBM.target_date == three_days,
            )
        ).all():
            notifications_service.create_notification(
                db, users[ms.user_id],
                title=f"Milestone due in 3 days: {ms.title}",
                url="/goals",
                event_key=f"ms_due3:{ms.id}:{today}",
            )

        # #13 — Scheduled-task reminders: one query, filter in Python by window
        for task in db.scalars(
            select(ScheduledTaskDBM).where(
                ScheduledTaskDBM.user_id.in_(user_ids),
                ScheduledTaskDBM.scheduled_date == today,
                ScheduledTaskDBM.status == "upcoming",
                ScheduledTaskDBM.preferred_time == "custom",
                ScheduledTaskDBM.specific_time.isnot(None),
            )
        ).all():
            try:
                h, m = map(int, task.specific_time.split(":"))
                task_time = current_ist_time.replace(hour=h, minute=m, second=0, microsecond=0)
                diff_s = (task_time - current_ist_time).total_seconds()
                if 0 < diff_s <= 1800:
                    notifications_service.create_notification(
                        db, users[task.user_id],
                        title=f"Starting soon: {task.title}",
                        body=f"In {int(diff_s / 60)} minutes.",
                        url="/schedule",
                        event_key=f"sched_reminder:{task.id}:{today}",
                    )
            except (ValueError, AttributeError):
                pass


# ── Per-user reminder jobs (at each user's default_reminder_time) ─────────────

def _reminder_jobs(today: date, user_ids: list[int]) -> None:
    yesterday = today - timedelta(days=1)

    with SessionLocal() as db:
        users = {u.id: u for u in db.scalars(
            select(UserDBM).where(UserDBM.id.in_(user_ids))
        ).all()}
        if not users:
            return

        # #9 — Tasks due today; group by user in Python after one query
        due_by_user: dict[int, list[TaskDBM]] = defaultdict(list)
        for task in db.scalars(
            select(TaskDBM)
            .join(MilestoneDBM, TaskDBM.milestone_id == MilestoneDBM.id)
            .where(
                TaskDBM.user_id.in_(user_ids),
                TaskDBM.status.notin_(["Completed", "Cancelled"]),
                MilestoneDBM.target_date == today,
            )
        ).all():
            due_by_user[task.user_id].append(task)

        for uid, tasks in due_by_user.items():
            names = ", ".join(t.title for t in tasks[:3])
            if len(tasks) > 3:
                names += "…"
            notifications_service.create_notification(
                db, users[uid],
                title=f"{len(tasks)} task{'s' if len(tasks) != 1 else ''} due today",
                body=names,
                url="/goals",
                event_key=f"tasks_due:{uid}:{today}",
            )

        # #10 — Tasks overdue; same pattern with yesterday's milestone deadline
        overdue_by_user: dict[int, list[TaskDBM]] = defaultdict(list)
        for task in db.scalars(
            select(TaskDBM)
            .join(MilestoneDBM, TaskDBM.milestone_id == MilestoneDBM.id)
            .where(
                TaskDBM.user_id.in_(user_ids),
                TaskDBM.status.notin_(["Completed", "Cancelled"]),
                MilestoneDBM.target_date == yesterday,
            )
        ).all():
            overdue_by_user[task.user_id].append(task)

        for uid, tasks in overdue_by_user.items():
            names = ", ".join(t.title for t in tasks[:3])
            if len(tasks) > 3:
                names += "…"
            notifications_service.create_notification(
                db, users[uid],
                title=f"{len(tasks)} overdue task{'s' if len(tasks) != 1 else ''}",
                body=names,
                url="/goals",
                event_key=f"tasks_overdue:{uid}:{today}",
            )


# ── Evening jobs (21:00 IST) ──────────────────────────────────────────────────

def _evening_jobs(today: date) -> None:
    with SessionLocal() as db:
        users = _active_users(db)
        if not users:
            return
        user_ids = list(users.keys())

        # #4 — End-of-day plan completion reminder
        # One GROUP BY query returns total+done counts for all users at once.
        for row in db.execute(
            select(
                DailyPlanRecordDBM.user_id,
                func.count().label("total"),
                func.sum(
                    case((DailyPlanRecordDBM.status == "done", 1), else_=0)
                ).label("done"),
            ).where(
                DailyPlanRecordDBM.user_id.in_(user_ids),
                DailyPlanRecordDBM.scheduled_date == today,
            ).group_by(DailyPlanRecordDBM.user_id)
        ).all():
            total, done = row.total or 0, int(row.done or 0)
            if total > 0 and done / total < 0.5:
                remaining = total - done
                uid = row.user_id
                notifications_service.create_notification(
                    db, users[uid],
                    title=f"You still have {remaining} item{'s' if remaining != 1 else ''} left today",
                    body=f"{done} of {total} complete. Finish strong.",
                    type="reminder",
                    url="/plan",
                    event_key=f"plan_reminder:{uid}:{today}",
                )

        # #12 — Habits not yet logged today (streak at risk)
        # Only consider habits that are actually on today's planner (DailyPlanRecordDBM),
        # not every active habit plan — avoids notifying for habits not scheduled today.
        unlogged_records = list(db.scalars(
            select(DailyPlanRecordDBM).where(
                DailyPlanRecordDBM.user_id.in_(user_ids),
                DailyPlanRecordDBM.scheduled_date == today,
                DailyPlanRecordDBM.source_type == "habit",
                DailyPlanRecordDBM.status != "done",
            )
        ).all())

        if unlogged_records:
            unlogged_by_user: dict[int, list[str]] = defaultdict(list)
            for record in unlogged_records:
                unlogged_by_user[record.user_id].append(record.title)

            for uid, titles in unlogged_by_user.items():
                names = ", ".join(titles[:3])
                if len(titles) > 3:
                    names += "…"
                notifications_service.create_notification(
                    db, users[uid],
                    title=f"{len(titles)} habit{'s' if len(titles) != 1 else ''} not logged yet today",
                    body=names,
                    type="reminder",
                    url="/plan",
                    event_key=f"habit_risk:{uid}:{today}",
                )


# ── Scheduler loop ────────────────────────────────────────────────────────────

async def notification_scheduler_loop() -> None:
    if not acquire_singleton_lock("notification_scheduler"):
        log.info("Notification scheduler: another worker is already running it, skipping.")
        return

    log.info("Notification scheduler started.")

    triggered_today: set[str] = set()
    last_date: date = now_ist().date()

    while True:
        await asyncio.sleep(60)

        now = now_ist()
        today = now.date()

        if today != last_date:
            triggered_today.clear()
            last_date = today

        minutes = now.hour * 60 + now.minute

        # Morning batch — 08:00 IST (global: goals/milestones due soon + scheduled reminders)
        if 8 * 60 <= minutes < 8 * 60 + 2 and "morning" not in triggered_today:
            triggered_today.add("morning")
            try:
                await asyncio.to_thread(_morning_jobs, today)
            except Exception:
                log.exception("Notification scheduler: morning jobs error")

        # Per-user reminder batch — fires at each user's configured default_reminder_time
        all_users: dict = {}
        reminder_times: dict = {}
        try:
            with SessionLocal() as db:
                all_users = _active_users(db)
                if all_users:
                    reminder_times = _get_reminder_times(db, list(all_users.keys()))
            if all_users:
                due_user_ids = [
                    uid for uid, hhmm in reminder_times.items()
                    if _hhmm_in_window(hhmm, minutes) and f"reminder:{uid}" not in triggered_today
                ]
                for uid in due_user_ids:
                    triggered_today.add(f"reminder:{uid}")
                if due_user_ids:
                    try:
                        await asyncio.to_thread(_reminder_jobs, today, due_user_ids)
                    except Exception:
                        log.exception("Notification scheduler: reminder jobs error")
        except Exception:
            log.exception("Notification scheduler: reminder time check error")

        # Evening batch — 21:00 IST (global: plan completion + habits)
        if 21 * 60 <= minutes < 21 * 60 + 2 and "evening" not in triggered_today:
            triggered_today.add("evening")
            try:
                await asyncio.to_thread(_evening_jobs, today)
            except Exception:
                log.exception("Notification scheduler: evening jobs error")
