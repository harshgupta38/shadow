from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class FoodLogDBM(Base):
    """One meal on one day. The items inside are the food actually eaten. Planned meals live in their own tables."""

    __tablename__ = "food_logs"
    __table_args__ = (
        UniqueConstraint("user_id", "log_date", "meal_type", name="uq_food_logs_user_date_meal"),
        Index("ix_food_logs_user_date", "user_id", "log_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)  # IST calendar day
    meal_type: Mapped[str] = mapped_column(String(40), nullable=False)  # a standard meal or a custom category
    eaten_at: Mapped[time | None] = mapped_column(Time, nullable=True)  # IST wall-clock time
    note: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    items: Mapped[list["FoodLogItemDBM"]] = relationship(  # type: ignore[name-defined]
        back_populates="log", cascade="all, delete-orphan", order_by="FoodLogItemDBM.position"
    )
