from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DietAgentRunDBM(Base):
    """One AI or fallback execution, kept for traceability: which agent, how long, how many tokens, whether it worked."""

    __tablename__ = "diet_agent_runs"
    __table_args__ = (CheckConstraint("status IN ('ok', 'failed', 'fallback')", name="ck_diet_agent_runs_status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    parent_run_id: Mapped[int | None] = mapped_column(ForeignKey("diet_agent_runs.id", ondelete="SET NULL"), nullable=True)
    agent: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(60), nullable=False, default="")
    input_summary: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    error: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
