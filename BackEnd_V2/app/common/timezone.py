from datetime import date, datetime, timezone, timedelta

_IST = timezone(timedelta(hours=5, minutes=30))


def to_ist(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_IST)


def today_ist() -> date:
    """The current calendar date in IST, regardless of the server's own local timezone."""
    return datetime.now(_IST).date()
