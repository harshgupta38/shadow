"""Limits on manual "Email report" sends (POST /reports/{date}/email).

Two limits, because each guards against something different:
  * A cooldown per user. Each send costs the user's inbox and the shared SMTP quota, and a retry loop would
    otherwise send copies one after another. The last send time lives in report_email_sends, so every uvicorn
    worker sees the same value.
  * A gate per process. A burst from many users must not hold every threadpool worker for the length of the
    SMTP attempts, so at most MAX_CONCURRENT_SENDS sends run at once in each process.
"""

import math
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import TooManyRequestsError
from app.models.report_email_send import ReportEmailSendDBM

COOLDOWN_SECONDS = 60
MAX_CONCURRENT_SENDS = 4

_send_slots = threading.BoundedSemaphore(MAX_CONCURRENT_SENDS)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def try_acquire_send_slot() -> bool:
    """Non-blocking. False means the gate is full and the caller should answer 503."""
    return _send_slots.acquire(blocking=False)


def release_send_slot() -> None:
    _send_slots.release()


def claim_send(db: Session, user_id: int) -> None:
    """Start this user's cooldown, or raise TooManyRequestsError with the seconds left.

    Race-safe across workers. The conditional UPDATE matches only a row whose last send is older than the
    cooldown, and SQLite runs one write at a time, so of two racing claims at most one can match. A user with
    no row yet gets one from the INSERT; if another worker inserted it first, the INSERT fails and the claim is
    refused. The claim is committed here, before the SMTP call, so no write lock is held during the send.
    """
    now = _now_utc()
    cutoff = now - timedelta(seconds=COOLDOWN_SECONDS)
    claimed = db.execute(
        update(ReportEmailSendDBM)
        .where(ReportEmailSendDBM.user_id == user_id, ReportEmailSendDBM.last_sent_at <= cutoff)
        .values(last_sent_at=now)
    ).rowcount
    if not claimed:
        try:
            db.add(ReportEmailSendDBM(user_id=user_id, last_sent_at=now))
            db.flush()
            claimed = 1
        except IntegrityError:
            db.rollback()  # another worker inserted the row first, so it is inside its cooldown
    if claimed:
        db.commit()
        return
    last = db.get(ReportEmailSendDBM, user_id, populate_existing=True)
    remaining = COOLDOWN_SECONDS
    if last is not None:
        remaining = (last.last_sent_at + timedelta(seconds=COOLDOWN_SECONDS) - _now_utc()).total_seconds()
    secs = max(1, math.ceil(remaining))
    raise TooManyRequestsError(
        f"You just emailed a report. You can send another in {secs} second{'s' if secs != 1 else ''}.",
        retry_after=secs,
    )
