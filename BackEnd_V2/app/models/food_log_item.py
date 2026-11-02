from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class FoodLogItemDBM(Base):
    """A food eaten in a meal. Name and nutrients are copied from the food at logging time (a snapshot), so later changes
    to the food library never alter history. food_id only records where the item came from."""

    __tablename__ = "food_log_items"
    __table_args__ = (
        CheckConstraint("verification IN ('verified', 'estimated', 'user')", name="ck_food_log_items_verification"),
        # how sure the logged quantity is
        CheckConstraint("quantity_certainty IN ('exact', 'estimated')", name="ck_food_log_items_certainty"),
        CheckConstraint("quantity > 0 AND grams > 0", name="ck_food_log_items_positive"),
        CheckConstraint(
            "calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0 AND fibre_g >= 0", name="ck_food_log_items_nonneg"
        ),
        UniqueConstraint("log_id", "client_token", name="uq_food_log_items_log_token"),  # NULL tokens never collide
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    log_id: Mapped[int] = mapped_column(ForeignKey("food_logs.id", ondelete="CASCADE"), index=True, nullable=False)
    food_id: Mapped[int | None] = mapped_column(ForeignKey("foods.id", ondelete="SET NULL"), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    grams: Mapped[float] = mapped_column(Float, nullable=False)
    calories: Mapped[float] = mapped_column(Float, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    fibre_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    nutrition_source: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    verification: Mapped[str] = mapped_column(String(12), nullable=False, default="estimated")
    quantity_certainty: Mapped[str] = mapped_column(String(10), nullable=False, default="exact")
    client_token: Mapped[str | None] = mapped_column(String(64), nullable=True)  # idempotency key against double submits
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    log: Mapped["FoodLogDBM"] = relationship(back_populates="items")  # type: ignore[name-defined]
