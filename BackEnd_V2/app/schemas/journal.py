from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


JournalMood = Literal["great", "good", "okay", "tough", "rough"]


class JournalEntryUpsertRequest(BaseModel):
    mood: JournalMood | None = None
    text: str = Field(default="", max_length=50_000)


class JournalEntryResponse(ORMModel):
    id: int
    entry_date: date
    mood: JournalMood | None
    text: str
    created_at: datetime
    updated_at: datetime
