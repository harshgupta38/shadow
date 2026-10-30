"""Pure helpers shared by the workout services: time estimates, muscle credit and week maths."""

import re
from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone

SECONDS_PER_SET = 45  # rough time under the bar for one set; the builder's live estimate uses the same number
SETUP_MINUTES = 5  # warm-up and changeover allowance per session
SECONDARY_CREDIT = 0.5  # a secondary muscle earns half a set for each set of the exercise
TIMED_REPS = re.compile(r"(\d+)\s*min\b")  # reps such as "20 min" name the time for one set


def estimate_minutes(sets_rest_and_reps: Iterable[tuple[int, int, str]]) -> int:
    """Estimated length of a session from (sets, rest_seconds, reps) rows. Zero when there is nothing to do."""
    rows = list(sets_rest_and_reps)
    if not rows:
        return 0
    seconds = sum(sets * (_seconds_per_set(reps) + rest) for sets, rest, reps in rows)
    return int(seconds / 60 + 0.5) + SETUP_MINUTES


def _seconds_per_set(reps: str) -> int:
    match = TIMED_REPS.search(reps)
    return int(match.group(1)) * 60 if match else SECONDS_PER_SET


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
