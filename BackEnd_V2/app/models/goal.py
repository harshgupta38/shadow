from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, JSON, String, func, text  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column  # pyright: ignore[reportMissingImports]

from app.models.base import Base


class Goal(Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('Active', 'Paused', 'Completed')",
            name="ck_goals_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(String(2000), nullable=False)
    category: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        index=True,
        nullable=False,
        default="Active",
        server_default=text("'Active'"),
    )

    motivation: Mapped[str] = mapped_column(String(2000), nullable=False)
    success_definition: Mapped[str] = mapped_column(String(2000), nullable=False)
    current_state: Mapped[str] = mapped_column(String(2000), nullable=False)

    challenges: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    strengths: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    success_metrics: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    insights: Mapped[list[str]] = mapped_column(JSON, nullable=False)

    target_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)

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
