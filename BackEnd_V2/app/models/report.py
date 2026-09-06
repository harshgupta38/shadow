from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReportDBM(Base):
    __tablename__ = "reports"
    __table_args__ = (
        UniqueConstraint("user_id", "report_date", "report_type", name="uq_report_user_date_type"),
        CheckConstraint("report_type IN ('daily', 'weekly')", name="ck_report_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    report_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    report_type: Mapped[str] = mapped_column(String(8), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    alignment_score: Mapped[int] = mapped_column(Integer, nullable=False)
    headline: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str] = mapped_column(String(4000), nullable=False)

    # Structured JSON payloads matching the ReportResponse schema fields
    stats: Mapped[dict] = mapped_column(JSON, nullable=False)
    goals: Mapped[list] = mapped_column(JSON, nullable=False)
    highlights: Mapped[dict] = mapped_column(JSON, nullable=False)
    closing: Mapped[dict] = mapped_column(JSON, nullable=False)

    model_used: Mapped[str | None] = mapped_column(String(200), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
