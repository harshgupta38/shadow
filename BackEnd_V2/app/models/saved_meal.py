from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SavedMealDBM(Base):
    """A reusable meal ("my usual lunch"): a named list of foods and quantities the user saved."""

    __tablename__ = "saved_meals"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_saved_meals_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    meal_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    items: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)  # [{food_id, name, quantity, unit}]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
