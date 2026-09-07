"""
Notification scheduler — fires time-based and daily-batch notifications.

Jobs:
  08:00 IST  morning_jobs:
    #5  Goals due in 3 days
    #7  Milestones due in 3 days
    #9  Tasks due today (via parent milestone target_date)
    #10 Tasks overdue (yesterday's milestone deadline, still incomplete)
    #13 Scheduled-task reminders (tasks with specific_time within next 30 min)

  21:00 IST  evening_jobs:
    #4  End-of-day plan completion reminder (< 50 % done)
    #12 Habits not yet logged today (streak-at-risk)

Deduplication: all notifications pass a stable event_key to create_notification(),
which skips the insert if (user_id, event_key) already exists in the table.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import func, select

from app.common.timezone import _IST
from app.db.session import SessionLocal
from app.models.goal import GoalDBM
from app.models.milestone import MilestoneDBM
from app.models.plan import PlanDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.schedule_task import ScheduledTaskDBM
from app.models.task import TaskDBM
from app.models.user import UserDBM
from app.services import notifications_service

log = logging.getLogger("uvicorn.error")


def _active_users(db) -> list[UserDBM]:
    return list(db.scalars(select(UserDBM)).all())


# ── Morning jobs (08:00 IST) ──────────────────────────────────────────────────

def _morning_jobs(today: date) -> None:
    three_days = today + timedelta(days=3)
    yesterday = today - timedelta(days=1)
    now_ist = datetime.now(_IST)

    with SessionLocal() as db:
        for user in _active_users(db):

            # #5 — Goals due in 3 days
            for goal in db.scalars(
                select(GoalDBM).where(
                    GoalDBM.user_id == user.id,
                    GoalDBM.status == "Active",
                    GoalDBM.target_date == three_days,
                )
            ).all():
                notifications_service.create_notification(
                    db, user,
                    title=f"Goal due in 3 days: {goal.title}",
                    body="Review your progress and plan your final push.",
                    url="/goals",
                    event_key=f"goal_due3:{goal.id}:{today}",
                )

            # #7 — Milestones due in 3 days
            for ms in db.scalars(
                select(MilestoneDBM).where(
                    MilestoneDBM.user_id == user.id,
                    MilestoneDBM.status.in_(["Not Started", "In Progress"]),
                    MilestoneDBM.target_date == three_days,
                )
            ).all():
                notifications_service.create_notification(
                    db, user,
                    title=f"Milestone due in 3 days: {ms.title}",
                    url="/goals",
                    event_key=f"ms_due3:{ms.id}:{today}",
                )

            # #9 — Tasks due today (via parent milestone target_date)
            due_today = list(db.scalars(
                select(TaskDBM)
                .join(MilestoneDBM, TaskDBM.milestone_id == MilestoneDBM.id)
                .where(
                    TaskDBM.user_id == user.id,
                    TaskDBM.status.notin_(["Completed", "Cancelled"]),
                    MilestoneDBM.target_date == today,
                )
            ).all())
            if due_today:
                names = ", ".join(t.title for t in due_today[:3])
                if len(due_today) > 3:
                    names += "…"
                notifications_service.create_notification(
                    db, user,
                    title=f"{len(due_today)} task{'s' if len(due_today) != 1 else ''} due today",
                    body=names,
                    url="/goals",
                    event_key=f"tasks_due:{user.id}:{today}",
                )

            # #10 — Tasks overdue (milestone deadline was yesterday, task still open)
            overdue = list(db.scalars(
                select(TaskDBM)
                .join(MilestoneDBM, TaskDBM.milestone_id == MilestoneDBM.id)
                .where(
                    TaskDBM.user_id == user.id,
                    TaskDBM.status.notin_(["Completed", "Cancelled"]),
                    MilestoneDBM.target_date == yesterday,
                )
            ).all())
            if overdue:
                names = ", ".join(t.title for t in overdue[:3])
                if len(overdue) > 3:
                    names += "…"
                notifications_service.create_notification(
                    db, user,
                    title=f"{len(overdue)} overdue task{'s' if len(overdue) != 1 else ''}",
                    body=names,
                    url="/goals",
                    event_key=f"tasks_overdue:{user.id}:{today}",
                )

            # #13 — Scheduled-task reminders: custom-time tasks starting within 30 min
            for task in db.scalars(
                select(ScheduledTaskDBM).where(
                    ScheduledTaskDBM.user_id == user.id,
                    ScheduledTaskDBM.scheduled_date == today,
                    ScheduledTaskDBM.status == "upcoming",
                    ScheduledTaskDBM.preferred_time == "custom",
                    ScheduledTaskDBM.specific_time.isnot(None),
                )
            ).all():
                try:
                    h, m = map(int, task.specific_time.split(":"))
                    task_time = now_ist.replace(hour=h, minute=m, second=0, microsecond=0)
                    diff_s = (task_time - now_ist).total_seconds()
                    if 0 < diff_s <= 1800:
                        notifications_service.create_notification(
                            db, user,
                            title=f"Starting soon: {task.title}",
                            body=f"In {int(diff_s / 60)} minutes.",
                            url="/schedule",
                            event_key=f"sched_reminder:{task.id}:{today}",
                        )
                except (ValueError, AttributeError):
                    pass


# ── Evening jobs (21:00 IST) ──────────────────────────────────────────────────

def _evening_jobs(today: date) -> None:
    with SessionLocal() as db:
        for user in _active_users(db):

            # #4 — End-of-day plan completion reminder
            total = db.scalar(
                select(func.count()).where(
                    DailyPlanRecordDBM.user_id == user.id,
                    DailyPlanRecordDBM.scheduled_date == today,
                )
            ) or 0
            done = db.scalar(
                select(func.count()).where(
                    DailyPlanRecordDBM.user_id == user.id,
                    DailyPlanRecordDBM.scheduled_date == today,
                    DailyPlanRecordDBM.status == "done",
                )
            ) or 0
            if total > 0 and done / total < 0.5:
                remaining = total - done
                notifications_service.create_notification(
                    db, user,
                    title=f"You still have {remaining} item{'s' if remaining != 1 else ''} left today",
                    body=f"{done} of {total} complete. Finish strong.",
                    type="reminder",
                    url="/plan",
                    event_key=f"plan_reminder:{user.id}:{today}",
                )

            # #12 — Habits not yet logged today (streak at risk)
            habit_plans_today = list(db.scalars(
                select(PlanDBM).where(
                    PlanDBM.user_id == user.id,
                    PlanDBM.source_type == "habit",
                    PlanDBM.status == "active",
                )
            ).all())

            unlogged = []
            for plan in habit_plans_today:
                rec = db.scalar(
                    select(DailyPlanRecordDBM).where(
                        DailyPlanRecordDBM.plan_id == plan.id,
                        DailyPlanRecordDBM.scheduled_date == today,
                    )
                )
                if rec is None or rec.status != "done":
                    unlogged.append(plan.title)

            if unlogged:
                names = ", ".join(unlogged[:3])
                if len(unlogged) > 3:
                    names += "…"
                notifications_service.create_notification(
                    db, user,
                    title=f"{len(unlogged)} habit{'s' if len(unlogged) != 1 else ''} not logged yet today",
                    body=names,
                    type="reminder",
                    url="/plan",
                    event_key=f"habit_risk:{user.id}:{today}",
                )


# ── Scheduler loop ────────────────────────────────────────────────────────────

async def notification_scheduler_loop() -> None:
    log.info("Notification scheduler started.")

    triggered_today: set[str] = set()
    last_date: date = datetime.now(_IST).date()

    while True:
        await asyncio.sleep(60)

        now = datetime.now(_IST)
        today = now.date()

        if today != last_date:
            triggered_today.clear()
            last_date = today

        minutes = now.hour * 60 + now.minute

        # Morning batch — 08:00 IST
        if 8 * 60 <= minutes < 8 * 60 + 2 and "morning" not in triggered_today:
            triggered_today.add("morning")
            try:
                await asyncio.to_thread(_morning_jobs, today)
            except Exception:
                log.exception("Notification scheduler: morning jobs error")

        # Evening batch — 21:00 IST
        if 21 * 60 <= minutes < 21 * 60 + 2 and "evening" not in triggered_today:
            triggered_today.add("evening")
            try:
                await asyncio.to_thread(_evening_jobs, today)
            except Exception:
                log.exception("Notification scheduler: evening jobs error")
