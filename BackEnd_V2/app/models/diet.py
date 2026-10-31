from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)  # pyright: ignore[reportMissingImports]
from sqlalchemy.orm import Mapped, mapped_column, relationship  # pyright: ignore[reportMissingImports]

from app.models.base import Base

SEX_VALUES = ("male", "female")
ACTIVITY_VALUES = ("sedentary", "light", "moderate", "active", "very_active")
OBJECTIVE_VALUES = ("fat_loss", "muscle_gain", "maintenance", "wellness", "custom")
DIET_PREFERENCE_VALUES = ("no_preference", "vegetarian", "eggetarian", "vegan", "pescatarian", "jain", "non_vegetarian")
HEIGHT_UNIT_VALUES = ("cm", "ft_in")  # the unit the height was typed in; the stored height is always centimetres
COOKING_VALUES = ("none", "minimal", "moderate", "plenty")
TARGET_SOURCE_VALUES = ("estimated", "user", "prescribed")
STANDARD_MEAL_TYPES = ("breakfast", "morning_snack", "lunch", "evening_snack", "dinner")
VERIFICATION_VALUES = ("verified", "estimated", "user")  # how far a food's nutrition can be trusted
CERTAINTY_VALUES = ("exact", "estimated")  # how sure the logged quantity is
PROPOSAL_STATUS_VALUES = ("pending", "saved", "dismissed")
PROPOSAL_KIND_VALUES = ("food_log",)
RUN_STATUS_VALUES = ("ok", "failed", "fallback")


def _one_of(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(value) for value in values)})"


class DietProfileDBM(Base):
    """One row per user: body details, food preferences and the daily targets. Targets are estimates until the user sets them."""

    __tablename__ = "diet_profiles"
    __table_args__ = (
        CheckConstraint(_one_of("sex", SEX_VALUES), name="ck_diet_profiles_sex"),
        CheckConstraint(_one_of("activity_level", ACTIVITY_VALUES), name="ck_diet_profiles_activity"),
        CheckConstraint(_one_of("objective", OBJECTIVE_VALUES), name="ck_diet_profiles_objective"),
        CheckConstraint(_one_of("dietary_preference", DIET_PREFERENCE_VALUES), name="ck_diet_profiles_diet_pref"),
        CheckConstraint(_one_of("cooking_availability", COOKING_VALUES), name="ck_diet_profiles_cooking"),
        CheckConstraint("age BETWEEN 14 AND 100", name="ck_diet_profiles_age"),
        CheckConstraint("height_cm BETWEEN 100 AND 250", name="ck_diet_profiles_height"),
        CheckConstraint(_one_of("height_unit", HEIGHT_UNIT_VALUES), name="ck_diet_profiles_height_unit"),
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


class FoodDBM(Base):
    """A food in the shared library (user_id NULL, seeded from app/data/diet/foods.json) or a user's own custom food.

    Nutrients are per 100 g. `serving_grams` maps the food's own units ("piece", "bowl") to grams.
    """

    __tablename__ = "foods"
    __table_args__ = (
        CheckConstraint(_one_of("verification", VERIFICATION_VALUES), name="ck_foods_verification"),
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


class FoodOverrideDBM(Base):
    """One user's own nutrition values (per 100 g) and serving sizes for a library food. Everyone else keeps the library values,
    and deleting the row restores the default. Logged meals are unaffected: they keep the numbers they were saved with."""

    __tablename__ = "food_overrides"
    __table_args__ = (
        UniqueConstraint("user_id", "food_id", name="uq_food_overrides_user_food"),
        CheckConstraint("calories >= 0 AND protein_g >= 0 AND carbs_g >= 0 AND fat_g >= 0 AND fibre_g >= 0", name="ck_food_overrides_nonneg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    food_id: Mapped[int] = mapped_column(ForeignKey("foods.id", ondelete="CASCADE"), nullable=False)
    calories: Mapped[float] = mapped_column(Float, nullable=False)
    protein_g: Mapped[float] = mapped_column(Float, nullable=False)
    carbs_g: Mapped[float] = mapped_column(Float, nullable=False)
    fat_g: Mapped[float] = mapped_column(Float, nullable=False)
    fibre_g: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    serving_grams: Mapped[dict[str, float]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class FoodFavouriteDBM(Base):
    __tablename__ = "food_favourites"
    __table_args__ = (UniqueConstraint("user_id", "food_id", name="uq_food_favourites_user_food"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    food_id: Mapped[int] = mapped_column(ForeignKey("foods.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


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

    items: Mapped[list["FoodLogItemDBM"]] = relationship(
        back_populates="log", cascade="all, delete-orphan", order_by="FoodLogItemDBM.position"
    )


class FoodLogItemDBM(Base):
    """A food eaten in a meal. Name and nutrients are copied from the food at logging time (a snapshot), so later changes
    to the food library never alter history. food_id only records where the item came from."""

    __tablename__ = "food_log_items"
    __table_args__ = (
        CheckConstraint(_one_of("verification", VERIFICATION_VALUES), name="ck_food_log_items_verification"),
        CheckConstraint(_one_of("quantity_certainty", CERTAINTY_VALUES), name="ck_food_log_items_certainty"),
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

    log: Mapped[FoodLogDBM] = relationship(back_populates="items")


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


class WaterLogDBM(Base):
    __tablename__ = "water_logs"
    __table_args__ = (
        CheckConstraint("amount_ml >= 0", name="ck_water_logs_amount"),
        UniqueConstraint("user_id", "log_date", name="uq_water_logs_user_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)  # IST calendar day
    amount_ml: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DietProposalDBM(Base):
    """An AI-prepared change waiting for the user's confirmation. Nothing here counts as eaten until it is confirmed."""

    __tablename__ = "diet_proposals"
    __table_args__ = (
        CheckConstraint(_one_of("kind", PROPOSAL_KIND_VALUES), name="ck_diet_proposals_kind"),
        CheckConstraint(_one_of("status", PROPOSAL_STATUS_VALUES), name="ck_diet_proposals_status"),
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


class DietAgentRunDBM(Base):
    """One AI or fallback execution, kept for traceability: which agent, how long, how many tokens, whether it worked."""

    __tablename__ = "diet_agent_runs"
    __table_args__ = (CheckConstraint(_one_of("status", RUN_STATUS_VALUES), name="ck_diet_agent_runs_status"),)

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
