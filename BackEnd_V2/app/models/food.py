from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FoodDBM(Base):
    """A food in the shared library (user_id NULL, seeded from app/data/diet/foods.json) or a user's own custom food.

    Nutrients are per 100 g. `serving_grams` maps the food's own units ("piece", "bowl") to grams.
    """

    __tablename__ = "foods"
    __table_args__ = (
        # how far a food's nutrition can be trusted
        CheckConstraint("verification IN ('verified', 'estimated', 'user')", name="ck_foods_verification"),
        CheckConstraint("calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0 AND fibre_g >= 0", name="ck_foods_nonneg"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_foods_confidence"),
        Index("ix_foods_user_name", "user_id", "name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    slug: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)  # seeded foods only
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    alt_names: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    search_text: Mapped[str] = mapped_column(Text, nullable=False, default="")  # lower-cased name + alt names, for matching
    category: Mapped[str] = mapped_column(String(40), nullable=False, default="other")
    cuisine: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    prep_method: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    diet_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)  # vegetarian, vegan, egg, contains_dairy, gluten ...
    calories: Mapped[float] = mapped_column(Float, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    fibre_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    micronutrients: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False, default=dict)
    serving_grams: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False, default=dict)
    default_unit: Mapped[str] = mapped_column(String(20), nullable=False, default="g")
    default_quantity: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    verification: Mapped[str] = mapped_column(String(12), nullable=False, default="estimated")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seed_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
