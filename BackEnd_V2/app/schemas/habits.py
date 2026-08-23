from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel

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
    name: str = Field(min_length=1, max_length=255)
    motivation: str | None = None
    frequencies: list[HabitFrequency] = Field(min_length=1, max_length=15)
    preferred_time: HabitPreferredTime = "flexible"
    specific_time: str = ""          # required (non-empty) when preferred_time == "custom"
    duration_minutes: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    # NULL means ongoing; non-NULL means the habit ends on that date.
    end_date: date | None = None
    priority: HabitPriority = "medium"
    # How many times per week; only relevant when "weekly" is in frequencies (1–6)
    weekly_count: int | None = Field(default=None, ge=1, le=6)
    # How many times per month; only relevant when "monthly" is in frequencies (1–27)
    monthly_count: int | None = Field(default=None, ge=1, le=27)
    # Specific days of month (1–31); required when "specific_day" is in frequencies
    specific_days: list[int] | None = None
    # When a specific day doesn't exist in a month: True = use last day, False = skip
    day_fallback: bool = False

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Habit name is required.")
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
            # Silently normalize — not a user error, just meaningless data.
            self.day_fallback = False

        # ── custom time ─────────────────────────────────────────────────
        if self.preferred_time == "custom" and not self.specific_time.strip():
            raise ValueError("A specific time is required when 'Custom time' is selected.")

        # ── date range ──────────────────────────────────────────────────
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date.")

        return self


class HabitUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    motivation: str | None = None
    frequencies: list[HabitFrequency] | None = Field(default=None, min_length=1, max_length=15)
    preferred_time: HabitPreferredTime | None = None
    specific_time: str | None = None
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
        # Only validate frequency conflicts when frequencies are explicitly being updated.
        if self.frequencies is not None:
            _check_frequency_conflicts(list(self.frequencies))

            # When updating frequencies AND specific_days in the same request,
            # check their consistency.
            has_specific_day = "specific_day" in self.frequencies
            if has_specific_day and not self.specific_days:
                raise ValueError(
                    "'specific_day' frequency requires at least one day in 'specific_days'."
                )
            if self.specific_days is not None and not has_specific_day and len(self.specific_days) > 0:
                raise ValueError(
                    "'specific_days' is only valid when 'specific_day' is in frequencies."
                )

        # Validate custom time: if changing to "custom", specific_time must be provided and non-empty.
        if self.preferred_time == "custom":
            if self.specific_time is None or not self.specific_time.strip():
                raise ValueError("A specific time is required when 'Custom time' is selected.")

        # Validate date range when both dates are explicitly provided.
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date.")

        return self


class HabitDataDBS(ORMModel):
    id: int
    name: str
    motivation: str | None
    frequencies: list[HabitFrequency]
    preferred_time: HabitPreferredTime
    specific_time: str | None
    duration_minutes: int | None
    start_date: date | None
    end_date: date | None
    priority: HabitPriority
    status: HabitStatus
    linked_items: dict
    created_at: datetime
    updated_at: datetime
    weekly_count: int | None
    monthly_count: int | None
    specific_days: list[int] | None
    day_fallback: bool


class HabitDataResponse(HabitDataDBS):
    @field_validator("specific_time", mode="before")
    @classmethod
    def coerce_none_to_empty(cls, v: Any) -> str:
        return v if isinstance(v, str) else ""

    specific_time: str = ""
