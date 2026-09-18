import asyncio
import logging
import time
from datetime import date, timedelta

from sqlalchemy import select

from app.common import now_ist
from app.common.proc_lock import acquire_singleton_lock
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.report_service import generate_report_background
from app.services.settings_service import get_reports_settings

log = logging.getLogger("uvicorn.error")

# Per-user scheduling means there's no longer a single global time to check
# in-memory before touching the DB — _candidates_with_settings is 2 queries
# (scan users with records + bulk settings fetch). Caching it means the loop's
# 30s poll interval doesn't turn into 2 DB round-trips every 30s, all day
# (2,880x/day) — the 2-minute fire window already tolerates this much staleness.
_CANDIDATES_CACHE_TTL_SECONDS = 120
_candidates_cache: dict[tuple[date, str], tuple[float, dict[int, dict]]] = {}


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


def _candidates_with_settings(report_date: date, report_type: str) -> dict[int, dict]:
    """Users with records in the period, joined with their per-user reports
    schedule (defaults filled in for anyone without a settings row)."""
    user_ids = _users_with_records(report_date, report_type)
    if not user_ids:
        return {}
    with SessionLocal() as db:
        return get_reports_settings(db, user_ids)


async def _cached_candidates_with_settings(report_date: date, report_type: str) -> dict[int, dict]:
    key = (report_date, report_type)
    now_ts = time.monotonic()
    cached = _candidates_cache.get(key)
    if cached is not None and now_ts - cached[0] < _CANDIDATES_CACHE_TTL_SECONDS:
        return cached[1]
    data = await asyncio.to_thread(_candidates_with_settings, report_date, report_type)
    _candidates_cache[key] = (now_ts, data)
    return data


async def _check_and_fire(
    report_date: date,
    report_type: str,
    current_minutes: int,
    triggered_today: set[tuple[int, str]],
) -> None:
    """Per-user schedule check — each user has their own enabled flag and time
    (see UserSettingDBM.reports), unlike the old single-global-time design."""
    candidates = await _cached_candidates_with_settings(report_date, report_type)
    if not candidates:
        return

    to_fire: list[int] = []
    for uid, cfg_by_type in candidates.items():
        if (uid, report_type) in triggered_today:
            continue
        cfg = cfg_by_type[report_type]
        if not cfg["enabled"]:
            continue
        slot = _parse_hhmm(cfg["time"])
        if slot is None or not (slot <= current_minutes < slot + 2):
            continue
        to_fire.append(uid)
        triggered_today.add((uid, report_type))

    if not to_fire:
        return

    log.info(
        "Report scheduler: firing %s report for %s — %d user(s)",
        report_type, report_date, len(to_fire),
    )

    tasks = [
        asyncio.create_task(generate_report_background(uid, report_date, report_type, force=True))
        for uid in to_fire
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for uid, result in zip(to_fire, results):
        if isinstance(result, BaseException):
            log.error(
                "Report scheduler: generation failed user=%d type=%s date=%s — %s",
                uid, report_type, report_date, result,
            )


async def report_scheduler_loop() -> None:
    """Polls every 30s and fires each user's daily/weekly report at THEIR OWN
    configured time (UserSettingDBM.reports — see settings_service.get_reports_settings),
    defaulting to 23:55 IST for anyone who hasn't touched the setting. Users can
    disable either cadence, change its time, or opt out of the auto-send email
    independently — this loop only decides WHEN to generate; the email opt-out
    is enforced downstream in email_notification_service.send_report_email.

    REPORT_AUTO_GENERATE remains a global ops kill-switch on top of all of this —
    when off, the loop doesn't start at all regardless of any user's preference.
    """
    if not settings.report_auto_generate:
        log.info("Report scheduler: auto-generation disabled (REPORT_AUTO_GENERATE=false).")
        return

    if not acquire_singleton_lock("report_scheduler"):
        log.info("Report scheduler: another worker is already running it, skipping.")
        return

    log.info("Report scheduler started (per-user schedule, default 23:55 IST).")

    triggered_today: set[tuple[int, str]] = set()
    last_date: date = now_ist().date()

    while True:
        await asyncio.sleep(30)

        now = now_ist()
        today = now.date()

        # Reset triggers at midnight so each job fires exactly once per day.
        # Also drop yesterday's cached candidates — keyed by date, so it would
        # otherwise grow by 2 entries/day forever.
        if today != last_date:
            triggered_today.clear()
            _candidates_cache.clear()
            last_date = today

        current_minutes = now.hour * 60 + now.minute

        try:
            await _check_and_fire(today, "daily", current_minutes, triggered_today)
        except Exception:
            log.exception("Report scheduler: daily run error for %s", today)

        # Weekly report window — checked daily but only meaningful on Saturdays,
        # since that's the only day report_service.build_day_data treats as a
        # week-ending date.
        if today.weekday() == 5:  # Saturday
            try:
                await _check_and_fire(today, "weekly", current_minutes, triggered_today)
            except Exception:
                log.exception("Report scheduler: weekly run error for %s", today)
