from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel
from app.schemas.goals import CategoryType

HabitFrequency = Literal[
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "daily",
    "weekly",
    "monthly",
    "weekdays",
    "weekends",
    "first_of_month",
    "end_of_month",
    "specific_day",
]

HabitStatus = Literal["active", "paused", "archived"]
HabitPriority = Literal["highest", "high", "medium", "low", "lowest"]
HabitPreferredTime = Literal["flexible", "morning", "afternoon", "evening", "night", "custom"]
HabitType = Literal["simple", "metric"]

# ── Frequency conflict helpers ────────────────────────────────────────────
_NAMED_DAYS    = frozenset({"sunday","monday","tuesday","wednesday","thursday","friday","saturday"})
_PERIOD_FREQS  = frozenset({"weekly","monthly","first_of_month","end_of_month","specific_day"})
_WEEKDAY_DAYS  = frozenset({"monday","tuesday","wednesday","thursday","friday"})
_WEEKEND_DAYS  = frozenset({"saturday","sunday"})


def _check_frequency_conflicts(freqs: list[str]) -> None:
    """Raise ValueError for any illegal frequency combination."""
    fset = set(freqs)

    # Duplicates
    if len(freqs) != len(fset):
        dupes = [f for f in freqs if freqs.count(f) > 1]
        raise ValueError(f"Duplicate frequencies are not allowed: {', '.join(set(dupes))}.")

    # daily is exclusive
    if "daily" in fset and len(fset) > 1:
        others = sorted(fset - {"daily"})
        raise ValueError(f"'Daily' cannot be combined with other frequencies ({', '.join(others)}).")

    # weekly ↔ monthly conflict
    if "weekly" in fset and "monthly" in fset:
        raise ValueError("'Weekly' and 'Monthly' cannot be combined.")

    # monthly blocks weekdays / weekends
    if "monthly" in fset:
        blocked = sorted(fset & {"weekdays", "weekends"})
        if blocked:
            raise ValueError(f"'Monthly' cannot be combined with: {', '.join(blocked)}.")

    # any period option + any named day
    period_overlap = sorted(fset & _PERIOD_FREQS)
    named_overlap  = sorted(fset & _NAMED_DAYS)
    if period_overlap and named_overlap:
        raise ValueError(
            f"Period-based frequencies ({', '.join(period_overlap)}) cannot be combined with "
            f"individual day selections ({', '.join(named_overlap)})."
        )

    # weekdays covers Mon–Fri — individual days are redundant
    if "weekdays" in fset and fset & _WEEKDAY_DAYS:
        raise ValueError(
            f"'Weekdays' already covers Monday–Friday; remove the individual selections "
            f"({', '.join(sorted(fset & _WEEKDAY_DAYS))})."
        )

    # weekends covers Sat–Sun
    if "weekends" in fset and fset & _WEEKEND_DAYS:
        raise ValueError(
            f"'Weekends' already covers Saturday–Sunday; remove the individual selections "
            f"({', '.join(sorted(fset & _WEEKEND_DAYS))})."
        )


class HabitCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    note: str | None = Field(default=None, max_length=2000)
    planner_type: HabitType = "simple"
    # Required (> 0) when planner_type == "metric"; null for simple habits
    planner_target: int | None = Field(default=None, gt=0)
    # Unit label (e.g. "pages", "km"); only meaningful for metric habits
    value_unit: str | None = Field(default=None, max_length=64)
    goal_id: int | None = None
    category: CategoryType | None = Field(default=None)

    frequencies: list[HabitFrequency] = Field(min_length=1, max_length=15)
    preferred_time: HabitPreferredTime = "flexible"
    specific_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")  # required when preferred_time == "custom"
    duration_minutes: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    priority: HabitPriority = "medium"
    weekly_count: int | None = Field(default=None, ge=1, le=6)
    monthly_count: int | None = Field(default=None, ge=1, le=27)
    specific_days: list[int] | None = None
    day_fallback: bool = False

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Habit title is required.")
        return value

    @field_validator("specific_days", mode="before")
    @classmethod
    def validate_specific_days_values(cls, value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, list):
            raise ValueError("specific_days must be a list of integers.")
        for d in value:
            if not isinstance(d, int) or not (1 <= d <= 31):
                raise ValueError("Each value in specific_days must be between 1 and 31.")
        return value

    @model_validator(mode="after")
    def validate_fields(self) -> "HabitCreateRequest":
        # ── Frequency conflicts ─────────────────────────────────────────
        _check_frequency_conflicts(list(self.frequencies))

        # ── specific_day ↔ specific_days consistency ────────────────────
        has_specific_day = "specific_day" in self.frequencies
        has_days_list    = bool(self.specific_days)

        if has_specific_day and not has_days_list:
            raise ValueError(
                "'specific_day' frequency requires at least one day to be selected in 'specific_days'."
            )
        if has_days_list and not has_specific_day:
            raise ValueError(
                "'specific_days' is only valid when 'specific_day' is in frequencies."
            )

        # ── day_fallback only makes sense when days ≥ 29 exist ──────────
        if self.day_fallback and not (self.specific_days and any(d >= 29 for d in self.specific_days)):
            self.day_fallback = False

        # ── custom time ─────────────────────────────────────────────────
        if self.preferred_time == "custom" and not (self.specific_time and self.specific_time.strip()):
            raise ValueError("A specific time is required when 'Custom time' is selected.")

        # ── date range ──────────────────────────────────────────────────
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date.")

        # ── metric habit requirements ────────────────────────────────────
        if self.planner_type == "metric":
            if self.planner_target is None:
                raise ValueError("planner_target is required for metric habits.")
        else:
            self.planner_target = None
            self.value_unit = None

        return self


class HabitUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    note: str | None = Field(default=None, max_length=2000)
    planner_type: HabitType | None = None
    planner_target: int | None = Field(default=None, gt=0)
    value_unit: str | None = Field(default=None, max_length=64)
    goal_id: int | None = None
    category: CategoryType | None = Field(default=None)

    frequencies: list[HabitFrequency] | None = Field(default=None, min_length=1, max_length=15)
    preferred_time: HabitPreferredTime | None = None
    specific_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_minutes: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    priority: HabitPriority | None = None
    status: HabitStatus | None = None
    weekly_count: int | None = Field(default=None, ge=1, le=6)
    monthly_count: int | None = Field(default=None, ge=1, le=27)
    specific_days: list[int] | None = None
    day_fallback: bool | None = None

    @field_validator("specific_days", mode="before")
    @classmethod
    def validate_specific_days_values(cls, value: Any) -> Any:
        if value is None:
            return value
        if not isinstance(value, list):
            raise ValueError("specific_days must be a list of integers.")
        for d in value:
            if not isinstance(d, int) or not (1 <= d <= 31):
                raise ValueError("Each value in specific_days must be between 1 and 31.")
        return value

    @model_validator(mode="after")
    def validate_update_fields(self) -> "HabitUpdateRequest":
        if self.frequencies is not None:
            _check_frequency_conflicts(list(self.frequencies))

            has_specific_day = "specific_day" in self.frequencies
            if has_specific_day and not self.specific_days:
                raise ValueError(
                    "'specific_day' frequency requires at least one day in 'specific_days'."
                )
            if self.specific_days is not None and not has_specific_day and len(self.specific_days) > 0:
                raise ValueError(
                    "'specific_days' is only valid when 'specific_day' is in frequencies."
                )

        if self.preferred_time == "custom":
            if self.specific_time is None or not self.specific_time.strip():
                raise ValueError("A specific time is required when 'Custom time' is selected.")

        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date.")

        if self.planner_type == "metric":
            if self.planner_target is None:
                raise ValueError("planner_target is required for metric habits.")
        elif self.planner_type == "simple":
            self.planner_target = None
            self.value_unit = None

        return self


class GoalSummary(BaseModel):
    id: int
    title: str
    category: str | None


class HabitDataResponse(BaseModel):
    model_config = ORMModel.model_config

    id: int
    title: str
    note: str | None
    planner_type: HabitType
    planner_target: int | None
    value_unit: str | None
    category: CategoryType | None
    goal: GoalSummary | None = None

    frequencies: list[HabitFrequency]
    priority: HabitPriority
    weekly_count: int | None
    monthly_count: int | None
    specific_days: list[int] | None
    day_fallback: bool
    start_date: date | None
    end_date: date | None
    preferred_time: HabitPreferredTime
    specific_time: str
    duration_minutes: int | None

    status: HabitStatus
    current_streak: int
    max_streak: int
    created_at: datetime
    updated_at: datetime


class SetTrackingRequest(BaseModel):
    enabled_ids: list[int]


class HabitHistoryStats(BaseModel):
    total_records: int
    total_done: int
    total_missed: int
    completion_rate: float  # 0.0 – 1.0


class HabitActivityRecord(BaseModel):
    date: date
    status: str
    value: float | None = None
    note: str | None = None
    streak: int = 0


class HabitActivityResponse(BaseModel):
    habit: HabitDataResponse
    records: list[HabitActivityRecord]
