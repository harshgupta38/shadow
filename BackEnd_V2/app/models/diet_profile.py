from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DietProfileDBM(Base):
    """One row per user: body details, food preferences and the daily targets. Targets are estimates until the user sets them."""

    __tablename__ = "diet_profiles"
    __table_args__ = (
        CheckConstraint("sex IN ('male', 'female')", name="ck_diet_profiles_sex"),
        CheckConstraint(
            "activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')",
            name="ck_diet_profiles_activity",
        ),
        CheckConstraint(
            "objective IN ('fat_loss', 'muscle_gain', 'maintenance', 'wellness', 'custom')",
            name="ck_diet_profiles_objective",
        ),
        CheckConstraint(
            "dietary_preference IN ('no_preference', 'vegetarian', 'eggetarian', 'vegan', 'pescatarian', 'jain', 'non_vegetarian')",
            name="ck_diet_profiles_diet_pref",
        ),
        CheckConstraint(
            "cooking_availability IN ('none', 'minimal', 'moderate', 'plenty')",
            name="ck_diet_profiles_cooking",
        ),
        CheckConstraint("age BETWEEN 14 AND 100", name="ck_diet_profiles_age"),
        CheckConstraint("height_cm BETWEEN 100 AND 250", name="ck_diet_profiles_height"),
        # the unit the height was typed in; the stored height is always centimetres
        CheckConstraint("height_unit IN ('cm', 'ft_in')", name="ck_diet_profiles_height_unit"),
        CheckConstraint("weight_kg BETWEEN 30 AND 300", name="ck_diet_profiles_weight"),
        CheckConstraint("meals_per_day BETWEEN 1 AND 8", name="ck_diet_profiles_meals"),
        CheckConstraint("calorie_target BETWEEN 500 AND 8000", name="ck_diet_profiles_calories"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    sex: Mapped[str | None] = mapped_column(String(10), nullable=True)
    height_cm: Mapped[float] = mapped_column(Float, nullable=False)
    height_unit: Mapped[str] = mapped_column(String(8), nullable=False, default="cm")
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    activity_level: Mapped[str] = mapped_column(String(16), nullable=False, default="light")
    objective: Mapped[str] = mapped_column(String(16), nullable=False, default="maintenance")
    objective_note: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    dietary_preference: Mapped[str] = mapped_column(String(20), nullable=False, default="vegetarian")
    allergies: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    intolerances: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    liked_foods: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    disliked_foods: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    cuisines: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    meals_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    meal_times: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)  # {"breakfast": "08:30"}
    cooking_availability: Mapped[str] = mapped_column(String(12), nullable=False, default="moderate")
    daily_budget: Mapped[float | None] = mapped_column(Float, nullable=True)

    calorie_target: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_target_g: Mapped[int] = mapped_column(Integer, nullable=False)
    carbs_target_g: Mapped[int] = mapped_column(Integer, nullable=False)
    fat_target_g: Mapped[int] = mapped_column(Integer, nullable=False)
    fibre_target_g: Mapped[int] = mapped_column(Integer, nullable=False)
    water_target_ml: Mapped[int] = mapped_column(Integer, nullable=False)
    target_sources: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)  # per target: estimated | user | prescribed
    bmr: Mapped[float | None] = mapped_column(Float, nullable=True)
    tdee: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
