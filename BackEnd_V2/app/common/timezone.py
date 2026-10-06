from datetime import date, datetime, timezone, timedelta

_IST = timezone(timedelta(hours=5, minutes=30))


def to_ist(dt: datetime) -> datetime:
    """Convert a datetime to IST. A naive datetime is assumed to already be UTC
    (the app's storage convention), not server-local time."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_IST)


def now_ist() -> datetime:
    """The current IST-aware datetime, regardless of the server's own local timezone."""
    return datetime.now(_IST)


def today_ist() -> date:
    """The current calendar date in IST, regardless of the server's own local timezone."""
    return now_ist().date()
