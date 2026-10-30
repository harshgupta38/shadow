from datetime import date
from typing import Literal

from pydantic import BaseModel

HabitDayState = Literal["done", "missed", "skipped", "none"]
TimeSlotId = Literal["morning", "afternoon", "evening", "night"]
PriorityTierId = Literal["highest", "high", "medium", "low"]
MetricKind = Literal["points", "days", "minutes"]
MetricId = Literal["alignment", "tasks", "habits", "strong_days", "focus_time"]
MissedKind = Literal["habit", "task", "schedule"]

# Every per-day list is ordered Sunday → Saturday (the weekly report window).
WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


class WeeklyDayResponse(BaseModel):
    tasks_done: int
    tasks_total: int
    habits_done: int
    habits_total: int
    score_pct: int | None  # partial-credit day score (same formula as the monthly calendar); None = nothing planned
    prev_score_pct: int | None  # same weekday, previous week


class WeeklyMetricComparisonResponse(BaseModel):
    id: MetricId
    label: str
    value: int
    previous: int | None  # None when the previous week has nothing to compare against
    kind: MetricKind
    suffix: str | None = None


class WeeklyScorePointResponse(BaseModel):
    week_end: date
    score: int | None  # alignment score of that week's weekly report; None = no report that week


class WeeklyHabitResponse(BaseModel):
    id: int
    title: str
    cells: list[HabitDayState]
    streak: int
    prev_done: int
    prev_planned: int


class WeeklyPriorityTierResponse(BaseModel):
    priority: PriorityTierId
    done: int
    total: int


class WeeklyTimeSlotResponse(BaseModel):
    id: TimeSlotId
    done: list[int]
    planned: list[int]


class WeeklyMissedItemResponse(BaseModel):
    id: int
    title: str
    kind: MissedKind
    misses: int
    note: str | None


class WeeklyGoalMomentumResponse(BaseModel):
    id: int
    title: str
    milestone_title: str
    alignment_pct: int
    prev_alignment_pct: int | None
    daily_pct: list[int | None]
    milestone_done: int
    milestone_total: int
    milestone_done_prev_week: int


class WeeklyFocusResponse(BaseModel):
    title: str
    rationale: str
    metric_label: str
    current_pct: int
    target_pct: int | None  # None when the current value is already 100 and there is nothing higher to aim for


class WeeklyInsightsResponse(BaseModel):
    days: list[WeeklyDayResponse]
    comparison: list[WeeklyMetricComparisonResponse]
    score_trend: list[WeeklyScorePointResponse]
    habits: list[WeeklyHabitResponse]
    priorities: list[WeeklyPriorityTierResponse]
    top_priority_misses: list[str]
    time_slots: list[WeeklyTimeSlotResponse]
    unslotted_count: int  # planned items with no time slot (flexible), left out of time_slots
    most_missed: list[WeeklyMissedItemResponse]
    goals: list[WeeklyGoalMomentumResponse]
    focus: WeeklyFocusResponse
