from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SubscriptionPaymentDBM(Base):
    """One attempt to buy a plan. Kept for accounting when the account is deleted, so the user link is cleared rather than the row."""

    __tablename__ = "subscription_payments"
    __table_args__ = (
        UniqueConstraint("provider", "provider_ref", name="uq_subscription_payments_provider_ref"),
        CheckConstraint("status IN ('pending', 'paid', 'failed')", name="ck_subscription_payments_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    plan_code: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
