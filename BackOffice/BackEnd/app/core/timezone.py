"""Time handling in BackOffice: stored as UTC, shown in IST.

Everything BackOffice writes to its database is UTC, but SQLite hands DateTime columns back with no
timezone attached. Sent to a browser as-is, "2026-10-06T16:44:58" is read as the browser's *local*
time, so a deploy done just now showed as "6h ago". Response models therefore mark such values as UTC
(UtcDateTime), and the frontend renders every time in IST.
"""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from pydantic import AfterValidator

UTC = timezone.utc
IST = timezone(timedelta(hours=5, minutes=30), "IST")


def ensure_utc(value: datetime) -> datetime:
    """A naive datetime read back from SQLite is UTC; an aware one is left alone."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UtcDateTime = Annotated[datetime, AfterValidator(ensure_utc)]
