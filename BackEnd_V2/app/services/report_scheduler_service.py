import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.common.timezone import _IST
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.report_service import generate_report_background

log = logging.getLogger("uvicorn.error")


def _parse_hhmm(raw: str) -> int | None:
    """Parse a 4-digit HHMM string into minutes-since-midnight. Returns None if invalid."""
    s = raw.strip()
    if len(s) != 4 or not s.isdigit():
        return None
    h, m = int(s[:2]), int(s[2:])
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return h * 60 + m


def _users_with_records(report_date: date, report_type: str) -> list[int]:
    """Return IDs of users who have at least one plan record in the report period."""
    from app.models.plan_record import DailyPlanRecordDBM  # local import

    if report_type == "weekly":
        week_start = report_date - timedelta(days=6)  # Sunday
        date_filter = (
            DailyPlanRecordDBM.scheduled_date >= week_start,
            DailyPlanRecordDBM.scheduled_date <= report_date,
        )
    else:
        date_filter = (DailyPlanRecordDBM.scheduled_date == report_date,)

    with SessionLocal() as db:
        return list(db.scalars(
            select(DailyPlanRecordDBM.user_id)
            .where(*date_filter)
            .distinct()
        ).all())


async def _run_for_all_users(report_date: date, report_type: str) -> None:
    user_ids = await asyncio.to_thread(_users_with_records, report_date, report_type)

    if not user_ids:
        log.info(
            "Report scheduler: no users with records for %s %s — skipping.",
            report_type, report_date,
        )
        return

    log.info(
        "Report scheduler: firing %s report for %s — %d user(s)",
        report_type, report_date, len(user_ids),
    )

    tasks = [
        asyncio.create_task(generate_report_background(uid, report_date, report_type))
        for uid in user_ids
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for uid, result in zip(user_ids, results):
        if isinstance(result, BaseException):
            log.error(
                "Report scheduler: generation failed user=%d type=%s date=%s — %s",
                uid, report_type, report_date, result,
            )


async def report_scheduler_loop() -> None:
    if not settings.report_auto_generate:
        log.info("Report scheduler: auto-generation disabled (REPORT_AUTO_GENERATE=false).")
        return

    daily_slot = _parse_hhmm(settings.report_daily_runtime)
    weekly_slot = _parse_hhmm(settings.report_weekly_runtime)

    if daily_slot is None:
        log.warning(
            "Report scheduler: invalid REPORT_DAILY_RUNTIME %r — expected HHMM. Skipping daily.",
            settings.report_daily_runtime,
        )
    if weekly_slot is None:
        log.warning(
            "Report scheduler: invalid REPORT_WEEKLY_RUNTIME %r — expected HHMM. Skipping weekly.",
            settings.report_weekly_runtime,
        )

    if daily_slot is None and weekly_slot is None:
        return

    log.info(
        "Report scheduler started. Daily=%s IST, Weekly=%s IST (Saturdays only).",
        settings.report_daily_runtime, settings.report_weekly_runtime,
    )

    triggered_today: set[str] = set()
    last_date: date = datetime.now(_IST).date()

    while True:
        await asyncio.sleep(30)

        now = datetime.now(_IST)
        today = now.date()

        # Reset triggers at midnight so each job fires exactly once per day.
        if today != last_date:
            triggered_today.clear()
            last_date = today

        current_minutes = now.hour * 60 + now.minute

        # Daily report — fires every day at REPORT_DAILY_RUNTIME.
        if (
            daily_slot is not None
            and daily_slot <= current_minutes < daily_slot + 2
            and "daily" not in triggered_today
        ):
            triggered_today.add("daily")
            try:
                await _run_for_all_users(today, "daily")
            except Exception:
                log.exception("Report scheduler: daily run error for %s", today)

        # Weekly report — fires on Saturdays only at REPORT_WEEKLY_RUNTIME.
        if (
            weekly_slot is not None
            and today.weekday() == 5  # Saturday
            and weekly_slot <= current_minutes < weekly_slot + 2
            and "weekly" not in triggered_today
        ):
            triggered_today.add("weekly")
            try:
                await _run_for_all_users(today, "weekly")
            except Exception:
                log.exception("Report scheduler: weekly run error for %s", today)
