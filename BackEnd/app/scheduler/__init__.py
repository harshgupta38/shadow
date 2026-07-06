"""APScheduler wiring — start/stop background jobs."""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.scheduler.jobs import (
    enqueue_daily_reports,
    enqueue_daily_briefs,
    enqueue_weekly_reports,
    enqueue_weekly_summaries,
    process_due_notifications,
)

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> BackgroundScheduler:
    """Start the background scheduler (idempotent)."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        process_due_notifications,
        trigger="interval",
        minutes=1,
        id="process_due_notifications",
        replace_existing=True,
    )
    _scheduler.add_job(
        enqueue_daily_briefs,
        trigger="interval",
        minutes=1,
        id="enqueue_daily_briefs",
        replace_existing=True,
    )
    _scheduler.add_job(
        enqueue_weekly_summaries,
        trigger="interval",
        minutes=1,
        id="enqueue_weekly_summaries",
        replace_existing=True,
    )
    _scheduler.add_job(
        enqueue_daily_reports,
        trigger="interval",
        minutes=1,
        id="enqueue_daily_reports",
        replace_existing=True,
    )
    _scheduler.add_job(
        enqueue_weekly_reports,
        trigger="interval",
        minutes=1,
        id="enqueue_weekly_reports",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("APScheduler started")
    return _scheduler


def shutdown_scheduler() -> None:
    """Stop the background scheduler if running."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")
    _scheduler = None


__all__ = ["start_scheduler", "shutdown_scheduler", "process_due_notifications"]
