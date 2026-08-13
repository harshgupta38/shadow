from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="Unknown Session",
        server_default=text("'Unknown Session'"),
    )
    agent_type: Mapped[str] = mapped_column(
        String(25),
        nullable=False,
        default="shadow",
        server_default=text("'shadow'"),
    )

    # Context fields for storing conversation context and summary
    stable_context: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default=text("''"),
    )
    context_summary: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default=text("''"),
    )
    # Linked items field for storing related items in JSON format
    linked_items: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
