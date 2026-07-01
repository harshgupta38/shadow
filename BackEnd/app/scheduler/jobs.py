"""Scheduled background jobs (run on the 24/7 server)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.models.notification import Notification

logger = logging.getLogger(__name__)


def process_due_notifications() -> int:
    """Mark notifications whose ``scheduled_at`` has passed as ``sent``.

    Returns the number of notifications dispatched. Kept simple for the MVP
    (in-app delivery); FCM push can hook in here later.
    """
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = list(
            db.scalars(
                select(Notification).where(
                    Notification.sent.is_(False),
                    Notification.scheduled_at.is_not(None),
                    Notification.scheduled_at <= now,
                )
            )
        )
        for notification in due:
            notification.sent = True
        if due:
            db.commit()
            logger.info("Dispatched %d due notification(s)", len(due))
        return len(due)
