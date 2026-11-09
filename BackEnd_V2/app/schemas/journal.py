from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


JournalMood = Literal["great", "good", "okay", "tough", "rough"]


class JournalEntryUpsertRequest(BaseModel):
    mood: JournalMood | None = None
    text: str = Field(default="", max_length=50_000)
    # The countdowns this day is a note for. Left out, the day's tags stay as they are; sent, they replace them.
    countdown_ids: list[int] | None = Field(default=None, max_length=20)


class JournalEntryResponse(ORMModel):
    id: int
    entry_date: date
    mood: JournalMood | None
    text: str
    countdown_ids: list[int] = []
    created_at: datetime
    updated_at: datetime
