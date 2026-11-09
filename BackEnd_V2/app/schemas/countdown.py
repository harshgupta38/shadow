from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel

CountdownColor = Literal["brand", "success", "info", "warn", "violet"]
CountdownStatus = Literal["active", "achieved"]

DEFAULT_EMOJI = "🎯"


def _clean_title(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError("Give the countdown a name.")
    return value


class CountdownCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    target_date: date
    # The day the person started counting. Empty means today; an earlier day lets a plan made long ago show the progress since.
    start_date: date | None = None
    emoji: str = Field(default=DEFAULT_EMOJI, min_length=1, max_length=16)
    color: CountdownColor = "brand"
    note: str | None = Field(default=None, max_length=500)

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, value):
        return _clean_title(value) if isinstance(value, str) else value


class CountdownUpdateRequest(BaseModel):
    """Only the fields that are sent change. `note` may be sent as null to clear it."""

    title: str | None = Field(default=None, min_length=1, max_length=120)
    target_date: date | None = None
    start_date: date | None = None
    emoji: str | None = Field(default=None, min_length=1, max_length=16)
    color: CountdownColor | None = None
    note: str | None = Field(default=None, max_length=500)
    status: CountdownStatus | None = None

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, value):
        return _clean_title(value) if isinstance(value, str) else value


class CountdownTaskResponse(BaseModel):
    """A scheduled task that is a step towards the countdown."""

    id: int
    title: str
    scheduled_date: date
    status: Literal["upcoming", "completed", "snoozed", "missed"]
    priority: str


class CountdownResponse(ORMModel):
    id: int
    title: str
    note: str | None
    emoji: str
    color: CountdownColor
    start_date: date
    target_date: date
    status: CountdownStatus
    achieved_at: datetime | None

    # Worked out for today (IST) when the response is made. Negative days_left means the date has passed.
    days_left: int
    total_days: int
    progress_pct: int

    tasks_total: int
    tasks_done: int
    notes_count: int

    created_at: datetime


class CountdownDetailResponse(CountdownResponse):
    tasks: list[CountdownTaskResponse]
