"""MemoryEntry — onboarding "understandings" and evolving behavior memory.

An ``embedding`` column is intentionally reserved for a future vector/RAG
retrieval step (§7.2 of the root README); it is nullable and unused today.
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin
from app.models.enums import MemoryCategory, MemorySource


class MemoryEntry(Base, TimestampMixin):
    __tablename__ = "memory_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    category: Mapped[MemoryCategory] = mapped_column(
        SAEnum(MemoryCategory), default=MemoryCategory.other, nullable=False
    )
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_understanding: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[MemorySource] = mapped_column(
        SAEnum(MemorySource), default=MemorySource.onboarding, nullable=False
    )
    # Reserved for future semantic retrieval (vector embeddings / RAG).
    embedding: Mapped[str | None] = mapped_column(Text, nullable=True)
