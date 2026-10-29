def format_duration(minutes: int) -> str:
    """"1h 30m" / "45m" / "2h" from a minute count (mirrors formatDuration in the frontend's date.service)."""
    h, m = divmod(max(minutes, 0), 60)
    if h == 0:
        return f"{m}m"
    return f"{h}h {m}m" if m else f"{h}h"
