"""Deterministic workout maths: time estimates, muscle credit and week maths. No database and no LLM."""

import re
from collections.abc import Iterable
from datetime import date, timedelta

SECONDS_PER_SET = 45  # rough time under the bar for one set; the builder's live estimate uses the same number
SETUP_MINUTES = 5  # warm-up and changeover allowance per session
SECONDARY_CREDIT = 0.5  # a secondary muscle earns half a set for each set of the exercise
WARM_UP_REP_SET_SECONDS = 40  # one set of warm-up reps, including moving into position
WARM_UP_POSITIONING_SECONDS = 10  # moving into position for a timed warm-up item
STEADY_BAND = 0.025  # a change smaller than this reads as "steady", not progress or decline
TIMED_REPS = re.compile(r"(\d+)\s*(min|sec)\b")  # a timed dose such as "20 min" or "30 sec" names the time for one set


def estimate_minutes(sets_rest_and_reps: Iterable[tuple[int, int, str]]) -> int:
    """Estimated length of a session from (sets, rest_seconds, reps) rows. Zero when there is nothing to do."""
    rows = list(sets_rest_and_reps)
    if not rows:
        return 0
    seconds = sum(sets * (_seconds_per_set(reps) + rest) for sets, rest, reps in rows)
    return int(seconds / 60 + 0.5) + SETUP_MINUTES


def _seconds_per_set(reps: str) -> int:
    match = TIMED_REPS.search(reps)
    if not match:
        return SECONDS_PER_SET
    return int(match.group(1)) * (60 if match.group(2) == "min" else 1)


def warm_up_seconds(sets: int, reps: str) -> int:
    """Rough time for one warm-up item. A timed dose takes its time plus a moment to get into position; a set of reps takes about 40 seconds."""
    if TIMED_REPS.search(reps) is None:
        return sets * WARM_UP_REP_SET_SECONDS
    return sets * (_seconds_per_set(reps) + WARM_UP_POSITIONING_SECONDS)


def timed_amount(dose: str, unit: str) -> int | None:
    """The number in a dose written only as "N min" or "N sec", otherwise None."""
    match = re.fullmatch(rf"(\d{{1,3}})\s*{unit}", dose.strip())
    return int(match.group(1)) if match else None


def dose_fits(measure: str, dose: str) -> bool:
    """Whether a rep text suits how the exercise is counted: minutes take "N min", seconds take "N sec", reps take neither."""
    if measure == "minutes":
        return timed_amount(dose, "min") is not None
    if measure == "seconds":
        return timed_amount(dose, "sec") is not None
    return TIMED_REPS.search(dose) is None


def sunday_based_weekday(day: date) -> int:
    """0 = Sunday … 6 = Saturday, the convention the workout API uses. Python's weekday() starts on Monday."""
    return (day.weekday() + 1) % 7


def week_start(day: date) -> date:
    """The Sunday that opens the week containing `day`."""
    return day - timedelta(days=sunday_based_weekday(day))


def clamp_int(value, low: int, high: int, default: int) -> int:
    """`value` as a whole number held between low and high, or `default` when it is missing or not a number."""
    try:
        number = int(value) if value is not None else default
    except (TypeError, ValueError):
        number = default
    return min(max(number, low), high)


def estimated_one_rep_max(weight_kg: float, reps: int) -> float | None:
    """The Epley estimate. Only sets of 1 to 12 reps give a usable one, so anything else returns None."""
    return round(weight_kg * (1 + reps / 30), 1) if weight_kg > 0 and 1 <= reps <= 12 else None


def strength_trend(scores_oldest_first: list[float]) -> str | None:
    """How the newer half of the scores compares with the older half: "improving", "steady" or "declining". None with fewer than
    four scores, which is too few to call a trend."""
    if len(scores_oldest_first) < 4:
        return None
    half = len(scores_oldest_first) // 2
    older = sum(scores_oldest_first[:half]) / half
    newer = sum(scores_oldest_first[-half:]) / half
    change = (newer - older) / older if older else 0
    return "improving" if change > STEADY_BAND else "declining" if change < -STEADY_BAND else "steady"


def plan_adherence(planned_weekdays: set[int], trained_on: set[date], first: date, today: date) -> tuple[int, int]:
    """(planned days, days trained) for the days from `first` up to, but not including, today. Today is still to come, so it is never
    counted as missed. Weekdays count 0 = Sunday."""
    planned = trained = 0
    day = first
    while day < today:
        if sunday_based_weekday(day) in planned_weekdays:
            planned += 1
            trained += day in trained_on
        day += timedelta(days=1)
    return planned, trained
