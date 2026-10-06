from __future__ import annotations

from datetime import date as date_type, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, LargeBinary, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DailyBriefAudioDBM(Base):
    """Caches the generated TTS audio for a brief so repeat listens don't re-call OpenAI."""

    __tablename__ = "daily_brief_audio"
    __table_args__ = (
        UniqueConstraint("user_id", "brief_date", name="uq_daily_brief_audio_user_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    brief_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    audio_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    # JSON-encoded list of {word, start, end} from transcribing our own generated
    # audio — real per-word timestamps for caption sync. Nullable: rows generated
    # before captions existed, or where transcription failed, have none.
    word_timings: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
