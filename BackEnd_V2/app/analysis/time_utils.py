from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

_IST = ZoneInfo("Asia/Kolkata")


def format_analytics_timestamp(timestamp: datetime) -> str:
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ValueError("Analytics timestamp must be timezone-aware.")

    local_dt = timestamp.astimezone(_IST)
    month_name = local_dt.strftime("%B")
    hour_12 = local_dt.hour % 12 or 12
    minute = local_dt.minute
    am_pm = local_dt.strftime("%p")

    return f"{local_dt.day:02d} {month_name} {local_dt.year} {hour_12}:{minute:02d} {am_pm}"