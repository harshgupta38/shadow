"""Pure helpers shared by the workout services: time estimates, muscle credit and week maths."""

from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone

SECONDS_PER_SET = 45  # rough time under the bar for one set; the builder's live estimate uses the same number
SETUP_MINUTES = 5  # warm-up and changeover allowance per session
SECONDARY_CREDIT = 0.5  # a secondary muscle earns half a set for each set of the exercise


def estimate_minutes(sets_and_rest: Iterable[tuple[int, int]]) -> int:
    """Estimated length of a session from (sets, rest_seconds) pairs. Zero when there is nothing to do."""
    pairs = list(sets_and_rest)
    if not pairs:
        return 0
    seconds = sum(sets * (SECONDS_PER_SET + rest) for sets, rest in pairs)
    return int(seconds / 60 + 0.5) + SETUP_MINUTES


def sunday_based_weekday(day: date) -> int:
    """0 = Sunday … 6 = Saturday, the convention the workout API uses. Python's weekday() starts on Monday."""
    return (day.weekday() + 1) % 7


def week_start(day: date) -> date:
    """The Sunday that opens the week containing `day`."""
    return day - timedelta(days=sunday_based_weekday(day))


def as_utc(moment: datetime) -> datetime:
    """Timestamps come back naive from SQLite; the app stores them in UTC, so naive means UTC."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)
