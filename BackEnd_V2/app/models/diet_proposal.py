from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DietProposalDBM(Base):
    """An AI-prepared change waiting for the user's confirmation. Nothing here counts as eaten until it is confirmed."""

    __tablename__ = "diet_proposals"
    __table_args__ = (
        CheckConstraint("kind IN ('food_log')", name="ck_diet_proposals_kind"),
        CheckConstraint("status IN ('pending', 'saved', 'dismissed')", name="ck_diet_proposals_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    proposal_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    source: Mapped[str] = mapped_column(String(10), nullable=False, default="text")  # text | image
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    run_id: Mapped[int | None] = mapped_column(ForeignKey("diet_agent_runs.id", ondelete="SET NULL"), nullable=True)
    saved_log_id: Mapped[int | None] = mapped_column(ForeignKey("food_logs.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
