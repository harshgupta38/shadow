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
]

HabitStatus = Literal["active", "paused", "archived"]
HabitPriority = Literal["highest", "high", "medium", "low", "lowest"]
HabitPreferredTime = Literal["flexible", "morning", "afternoon", "evening", "night", "custom"]


class HabitCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    motivation: str | None = None
    frequencies: list[HabitFrequency] = Field(min_length=1, max_length=14)
    preferred_time: HabitPreferredTime = "flexible"
    specific_time: str = ""          # required (non-empty) when preferred_time == "custom"
    duration_minutes: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    # NULL means ongoing; non-NULL means the habit ends on that date.
    end_date: date | None = None
    priority: HabitPriority = "medium"

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Habit name is required.")
        return value

    @model_validator(mode="after")
    def validate_fields(self) -> "HabitCreateRequest":
        if self.preferred_time == "custom" and not self.specific_time.strip():
            raise ValueError("A specific time is required when 'Custom time' is selected.")
        if self.end_date is not None and self.start_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date.")
        return self


class HabitUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    motivation: str | None = None
    frequencies: list[HabitFrequency] | None = Field(default=None, min_length=1, max_length=14)
    preferred_time: HabitPreferredTime | None = None
    specific_time: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1)
    start_date: date | None = None
    end_date: date | None = None
    priority: HabitPriority | None = None
    status: HabitStatus | None = None


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


class HabitDataResponse(HabitDataDBS):
    @field_validator("specific_time", mode="before")
    @classmethod
    def coerce_none_to_empty(cls, v: Any) -> str:
        return v if isinstance(v, str) else ""

    specific_time: str = ""
