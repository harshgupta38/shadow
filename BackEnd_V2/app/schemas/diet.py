from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel

Sex = Literal["male", "female"]
HeightUnit = Literal["cm", "ft_in"]
ActivityLevel = Literal["sedentary", "light", "moderate", "active", "very_active"]
Objective = Literal["fat_loss", "muscle_gain", "maintenance", "wellness", "custom"]
DietaryPreference = Literal["no_preference", "vegetarian", "eggetarian", "vegan", "pescatarian", "jain", "non_vegetarian"]
CookingAvailability = Literal["none", "minimal", "moderate", "plenty"]
Verification = Literal["verified", "estimated", "user"]
Certainty = Literal["exact", "estimated"]
FoodScope = Literal["all", "mine", "favourites"]

DISCLAIMER = (
    "Estimates for general wellbeing, not medical advice. If you have a medical condition, are pregnant, "
    "or take medication that affects eating, please follow your doctor or dietitian's plan."
)


def _clean_list(values: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for value in values:
        text = value.strip()
        if text and text.lower() not in seen:
            seen[text.lower()] = text[:60]
    return list(seen.values())


CM_PER_FOOT = 30.48
CM_PER_INCH = 2.54


class HeightInput(BaseModel):
    """The height as the user typed it: centimetres, or feet and inches. Feet and inches are converted to centimetres here,
    so everything after this point (the estimate, the stored profile) works in centimetres."""

    height_unit: HeightUnit = "cm"
    height_cm: float | None = Field(default=None, ge=100, le=250)
    height_feet: int | None = Field(default=None, ge=3, le=8)
    height_inches: float | None = Field(default=None, ge=0, lt=12)

    @model_validator(mode="after")
    def _to_centimetres(self) -> "HeightInput":
        if self.height_unit == "cm":
            if self.height_cm is None:
                raise ValueError("Enter your height in centimetres.")
            return self
        if self.height_feet is None or self.height_inches is None:
            raise ValueError("Enter your height in feet and inches.")
        centimetres = self.height_feet * CM_PER_FOOT + self.height_inches * CM_PER_INCH
        if not 100 <= centimetres <= 250:
            raise ValueError("Enter a height from 3 ft 4 in to 8 ft 2 in.")
        self.height_cm = round(centimetres, 1)
        return self

    @property
    def centimetres(self) -> float:
        assert self.height_cm is not None  # set by _to_centimetres
        return self.height_cm


# ---------- profile ----------


class TargetValues(BaseModel):
    calorie_target: int
    protein_target_g: int
    carbs_target_g: int
    fat_target_g: int
    fibre_target_g: int
    water_target_ml: int


class TargetOverrides(BaseModel):
    """Targets the user chose themselves. Any left out keep their estimate (or their current value)."""

    calorie_target: int | None = Field(default=None, ge=500, le=8000)
    protein_target_g: int | None = Field(default=None, ge=10, le=500)
    carbs_target_g: int | None = Field(default=None, ge=0, le=1000)
    fat_target_g: int | None = Field(default=None, ge=10, le=400)
    fibre_target_g: int | None = Field(default=None, ge=5, le=100)
    water_target_ml: int | None = Field(default=None, ge=500, le=10000)
    prescribed: bool = False  # set when these come from a doctor or dietitian rather than the user's own choice


class ProfileSaveRequest(HeightInput):
    age: int = Field(ge=14, le=100)
    sex: Sex | None = None
    weight_kg: float = Field(ge=30, le=300)
    target_weight_kg: float | None = Field(default=None, ge=30, le=300)
    activity_level: ActivityLevel = "light"
    objective: Objective = "maintenance"
    objective_note: str = Field(default="", max_length=200)
    dietary_preference: DietaryPreference = "vegetarian"
    allergies: list[str] = Field(default_factory=list, max_length=30)
    intolerances: list[str] = Field(default_factory=list, max_length=30)
    liked_foods: list[str] = Field(default_factory=list, max_length=50)
    disliked_foods: list[str] = Field(default_factory=list, max_length=50)
    cuisines: list[str] = Field(default_factory=list, max_length=20)
    meals_per_day: int = Field(default=3, ge=1, le=8)
    meal_times: dict[str, str] = Field(default_factory=dict)
    cooking_availability: CookingAvailability = "moderate"
    daily_budget: float | None = Field(default=None, ge=0, le=100000)
    targets: TargetOverrides | None = None
    recalculate_targets: bool = False  # true: replace targets the user set earlier with fresh estimates

    @field_validator("allergies", "intolerances", "liked_foods", "disliked_foods", "cuisines")
    @classmethod
    def _tidy(cls, values: list[str]) -> list[str]:
        return _clean_list(values)

    @field_validator("meal_times")
    @classmethod
    def _valid_times(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > 20:
            raise ValueError("Too many meal times.")
        for meal, clock in value.items():
            if not meal.strip() or len(meal) > 40:
                raise ValueError("Meal names must be 1 to 40 characters.")
            try:
                time.fromisoformat(clock)
            except ValueError as exc:
                raise ValueError(f"{meal} time must look like 08:30.") from exc
        return value


class EstimateRequest(HeightInput):
    age: int = Field(ge=14, le=100)
    sex: Sex
    weight_kg: float = Field(ge=30, le=300)
    activity_level: ActivityLevel = "light"
    objective: Objective = "maintenance"


class EstimateResponse(ORMModel):
    bmr: float
    tdee: float
    targets: TargetValues
    notes: list[str]
    disclaimer: str = DISCLAIMER


class ProfileResponse(ORMModel):
    age: int
    sex: Sex | None
    height_cm: float
    height_unit: HeightUnit
    weight_kg: float
    target_weight_kg: float | None
    activity_level: ActivityLevel
    objective: Objective
    objective_note: str
    dietary_preference: DietaryPreference
    allergies: list[str]
    intolerances: list[str]
    liked_foods: list[str]
    disliked_foods: list[str]
    cuisines: list[str]
    meals_per_day: int
    meal_times: dict[str, str]
    cooking_availability: CookingAvailability
    daily_budget: float | None
    calorie_target: int
    protein_target_g: int
    carbs_target_g: int
    fat_target_g: int
    fibre_target_g: int
    water_target_ml: int
    target_sources: dict[str, str]  # per target: estimated | user | prescribed
    bmr: float | None
    tdee: float | None
    notes: list[str] = Field(default_factory=list)  # why an estimate was adjusted
    warnings: list[str] = Field(default_factory=list)  # about targets the user set manually
    disclaimer: str = DISCLAIMER


class ProfileStateResponse(BaseModel):
    onboarded: bool
    profile: ProfileResponse | None = None


# ---------- foods ----------


class FoodDefaults(BaseModel):
    """The library's own values for a food the user has edited, so they can see what they changed."""

    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fibre_g: float
    serving_grams: dict[str, float]


class FoodResponse(ORMModel):
    id: int
    name: str
    alt_names: list[str]
    category: str
    cuisine: str
    prep_method: str
    diet_tags: list[str]
    calories: float  # per 100 g
    protein_g: float
    carbs_g: float
    fat_g: float
    fibre_g: float
    serving_grams: dict[str, float]
    default_unit: str
    default_quantity: float
    source: str
    verification: Verification
    confidence: float
    is_custom: bool = False
    is_favourite: bool = False
    is_edited: bool = False  # a library food whose values this user changed
    defaults: FoodDefaults | None = None  # present when edited


class FoodSearchHit(BaseModel):
    food: FoodResponse
    match: Literal["exact", "prefix", "contains", "similar"]


class FoodCustomRequest(BaseModel):
    """A food the user adds, entered per serving the way a package label shows it."""

    name: str = Field(min_length=1, max_length=140)
    serving_label: str = Field(default="serving", min_length=1, max_length=20)
    serving_grams: float = Field(gt=0, le=5000)
    calories: float = Field(ge=0, le=5000)
    protein_g: float = Field(default=0, ge=0, le=500)
    carbs_g: float = Field(default=0, ge=0, le=1000)
    fat_g: float = Field(default=0, ge=0, le=500)
    fibre_g: float = Field(default=0, ge=0, le=200)
    category: str = Field(default="other", max_length=40)

    @field_validator("name", "serving_label", "category")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("serving_label")
    @classmethod
    def _not_a_weight_unit(cls, value: str) -> str:
        # "g", "kg" and the like already mean a weight; as a serving name they would make one serving weigh one gram.
        if value.lower() in {"g", "gram", "grams", "kg", "mg", "oz", "ml"}:
            raise ValueError("Name the serving something like bar, cup or piece, not a unit of weight.")
        return value


_WEIGHT_UNIT_NAMES = {"g", "gram", "grams", "kg", "mg", "oz"}


class FoodValuesRequest(BaseModel):
    """A user's own values for a library food. Nutrients are per 100 g; serving sizes map a unit name to grams."""

    calories: float = Field(ge=0, le=900)
    protein_g: float = Field(ge=0, le=100)
    carbs_g: float = Field(ge=0, le=100)
    fat_g: float = Field(ge=0, le=100)
    fibre_g: float = Field(default=0, ge=0, le=100)
    serving_grams: dict[str, float] = Field(default_factory=dict)

    @field_validator("serving_grams")
    @classmethod
    def _valid_servings(cls, value: dict[str, float]) -> dict[str, float]:
        if len(value) > 20:
            raise ValueError("Too many serving sizes.")
        cleaned: dict[str, float] = {}
        for name, grams in value.items():
            key = name.strip().lower()
            if not key or len(key) > 20:
                raise ValueError("Serving names must be 1 to 20 characters.")
            if key in _WEIGHT_UNIT_NAMES:
                raise ValueError("Name the serving something like piece, bowl or cup, not a unit of weight.")
            if not (0.1 <= grams <= 5000):
                raise ValueError("A serving must weigh between 0.1 g and 5000 g.")
            cleaned[key] = round(float(grams), 1)
        return cleaned


class QuickFoodsResponse(BaseModel):
    favourites: list[FoodResponse]
    recent: list[FoodResponse]
    frequent: list[FoodResponse]


# ---------- diary ----------


class NutrientTotals(ORMModel):
    calories: float = 0.0
    protein_g: float = 0.0
    carbs_g: float = 0.0
    fat_g: float = 0.0
    fibre_g: float = 0.0


class NutrientValuesRequest(BaseModel):
    """Nutrition the user typed for one amount of a food: totals for that amount, not per 100 g."""

    calories: float = Field(ge=0, le=10000)
    protein_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)
    fibre_g: float = Field(ge=0, le=2000)


class LogItemRequest(BaseModel):
    food_id: int
    quantity: float = Field(gt=0, le=10000)
    unit: str = Field(min_length=1, max_length=20)
    certainty: Certainty | None = None  # left out: household measures (bowl, katori...) count as estimates, weights as exact
    client_token: str | None = Field(default=None, max_length=64)  # the same token twice adds the item once
    nutrients: NutrientValuesRequest | None = None  # left out: the food's own values for this amount; given: the user's, used as typed


class DiaryAddRequest(BaseModel):
    log_date: date | None = None
    meal_type: str = Field(min_length=1, max_length=40)
    eaten_at: time | None = None
    items: list[LogItemRequest] = Field(min_length=1, max_length=30)

    @field_validator("meal_type")
    @classmethod
    def _norm_meal(cls, value: str) -> str:
        return value.strip().lower().replace(" ", "_")


class DiaryItemUpdateRequest(BaseModel):
    quantity: float | None = Field(default=None, gt=0, le=10000)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    certainty: Certainty | None = None
    nutrients: NutrientValuesRequest | None = None  # the user's own values for the amount this item has after the change
    reset_nutrients: bool = False  # go back to the food's own values for the amount


class DiaryItemMoveRequest(BaseModel):
    meal_type: str = Field(min_length=1, max_length=40)
    log_date: date | None = None

    @field_validator("meal_type")
    @classmethod
    def _norm_meal(cls, value: str) -> str:
        return value.strip().lower().replace(" ", "_")


class DiaryMealUpdateRequest(BaseModel):
    eaten_at: time | None = None
    note: str | None = Field(default=None, max_length=300)


class DiaryItemResponse(ORMModel):
    id: int
    food_id: int | None
    name: str
    quantity: float
    unit: str
    grams: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fibre_g: float
    nutrition_source: str
    verification: Verification
    quantity_certainty: Certainty


class DiaryMealResponse(BaseModel):
    id: int
    meal_type: str
    eaten_at: time | None
    note: str
    items: list[DiaryItemResponse]
    totals: NutrientTotals
    notices: list[str] = Field(default_factory=list)  # allergy or diet conflicts, and anything left out of what was just added


class DiaryDayResponse(BaseModel):
    date: date
    meals: list[DiaryMealResponse]
    totals: NutrientTotals
    water_ml: int
    has_estimated_items: bool  # some logged nutrition is an estimate, not a verified value


class HistoryItemResponse(BaseModel):
    name: str
    quantity: float
    unit: str


class HistoryMealResponse(BaseModel):
    meal_type: str
    eaten_at: time | None
    items: list[HistoryItemResponse]


class HistoryDayResponse(BaseModel):
    """What was eaten on one day and when, with no nutrients: the month history is about the food, not the numbers."""

    date: date
    meals: list[HistoryMealResponse]


class ScoreDayResponse(BaseModel):
    """One logged day for the month calendar: what was eaten in total, the water drunk and the habit score it earned."""

    date: date
    totals: NutrientTotals
    water_ml: int
    score: int  # the same 0-100 habit score as the Overview, worked out against the current targets


class CopyItemsRequest(BaseModel):
    from_date: date
    to_date: date | None = None
    item_ids: list[int] = Field(min_length=1, max_length=200)  # the foods to copy, each into the same meal on the target day


class CopyItemsResponse(BaseModel):
    copied_items: int
    day: DiaryDayResponse


class SavedMealCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    log_date: date
    meal_type: str

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class SavedMealResponse(ORMModel):
    id: int
    name: str
    meal_type: str | None
    items: list[dict]


class SavedMealLogRequest(BaseModel):
    log_date: date | None = None
    meal_type: str | None = None
    eaten_at: time | None = None


# ---------- water ----------


class WaterAddRequest(BaseModel):
    delta_ml: int = Field(ge=-10000, le=10000)
    log_date: date | None = None

    @model_validator(mode="after")
    def _not_zero(self) -> "WaterAddRequest":
        if self.delta_ml == 0:
            raise ValueError("delta_ml must not be zero")
        return self


class WaterDayResponse(BaseModel):
    date: date
    total_ml: int
    target_ml: int | None


class WaterHistoryPoint(BaseModel):
    date: date
    total_ml: int


# ---------- overview ----------


class MacroProgress(BaseModel):
    consumed: float
    target: float
    percent: float  # of target, uncapped so overshoot is visible


class ScoreComponentResponse(BaseModel):
    key: str
    points: float
    max_points: int
    explanation: str


class NutritionScoreResponse(BaseModel):
    score: int | None  # None when nothing is logged: an empty day is unknown, not a bad day
    components: list[ScoreComponentResponse]
    explanation: str


class MealSummary(BaseModel):
    meal_type: str
    eaten_at: time | None
    item_count: int
    totals: NutrientTotals


class OverviewResponse(BaseModel):
    date: date
    calories: MacroProgress
    remaining_calories: float
    protein: MacroProgress
    carbs: MacroProgress
    fat: MacroProgress
    fibre: MacroProgress
    meals: list[MealSummary]
    water: MacroProgress
    score: NutritionScoreResponse
    has_estimated_items: bool
    disclaimer: str = DISCLAIMER


# ---------- AI proposals (food logging) ----------


class ProposalItemResponse(BaseModel):
    index: int
    text: str  # what the user said
    status: Literal["resolved", "needs_quantity", "unmatched"]
    food_id: int | None = None
    name: str = ""
    quantity: float | None = None
    unit: str | None = None
    grams: float | None = None
    nutrients: NutrientTotals | None = None
    custom_nutrition: bool = False  # the user typed these nutrients instead of taking the food's own
    verification: Verification | None = None
    nutrition_source: str = ""
    quantity_certainty: Certainty = "exact"
    note: str = ""  # e.g. "Assumed one bowl = 150 g"
    units: list[str] = Field(default_factory=list)  # serving units this food can be measured in, grams included
    candidates: list[FoodResponse] = Field(default_factory=list)  # other foods it could be


class ProposalResponse(BaseModel):
    proposal_id: str
    status: Literal["pending", "saved", "dismissed"]
    source: Literal["text", "image"]
    log_date: date
    meal_type: str
    eaten_at: time | None
    items: list[ProposalItemResponse]
    totals: NutrientTotals
    clarifications: list[str]
    warnings: list[str]  # allergy or preference conflicts
    can_confirm: bool
    estimated: bool = True
    saved_log_id: int | None = None  # the diary meal this was saved into


class ParseMealRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    log_date: date | None = None
    meal_type: str | None = Field(default=None, max_length=40)


class ProposalItemEdit(BaseModel):
    index: int
    food_id: int | None = None
    quantity: float | None = Field(default=None, gt=0, le=10000)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    remove: bool = False
    nutrients: NutrientValuesRequest | None = None  # the user's own values for this item's amount
    reset_nutrients: bool = False  # go back to the food's own values


class ProposalEditRequest(BaseModel):
    meal_type: str | None = Field(default=None, max_length=40)
    log_date: date | None = None
    eaten_at: time | None = None
    items: list[ProposalItemEdit] = Field(default_factory=list, max_length=30)


class ProposalReviseRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)  # "Actually, I ate three chapatis"


class ProposalConfirmResponse(BaseModel):
    proposal: ProposalResponse
    meal: DiaryMealResponse


# ---------- meal coach ----------


class MealCoachRequest(BaseModel):
    meal_type: Literal["breakfast", "morning_snack", "lunch", "evening_snack", "dinner"] | None = None  # left out: the next meal not yet logged
    note: str | None = Field(default=None, max_length=200)  # "something light", "I have paneer at home"
    exclude: list[str] = Field(default_factory=list, max_length=12)  # titles already shown, so "different ideas" are different

    @field_validator("note")
    @classmethod
    def _blank_note(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None

    @field_validator("exclude")
    @classmethod
    def _trim_exclude(cls, value: list[str]) -> list[str]:
        return [title.strip()[:120] for title in value if title.strip()]


class MealIdeaItemResponse(BaseModel):
    food_id: int
    name: str
    quantity: float
    unit: str
    grams: float
    nutrients: NutrientTotals


class MealIdeaResponse(BaseModel):
    title: str
    why: str
    source: Literal["ai", "basic"]  # basic: put together by code from the food library, without the AI
    items: list[MealIdeaItemResponse]
    totals: NutrientTotals


class MealCoachResponse(BaseModel):
    meal_type: str
    remaining: NutrientTotals  # today's targets minus what is logged so far; negative once a target is passed
    budget: NutrientTotals  # what this one meal is aimed at
    over_target: bool  # today's calorie target is already reached
    ideas: list[MealIdeaResponse]
    notice: str | None = None
    disclaimer: str


# ── Raw LLM output ───────────────────────────────────────────────────────────
# Every field is required (nullable where it can be absent) so strict structured-output providers accept them.
# The model only reads language; foods and nutrients are resolved by code.

MealType = Literal["breakfast", "morning_snack", "lunch", "evening_snack", "dinner"]


class ParsedFoodItemFromLLMSchema(BaseModel):
    text: str = Field(description="The words the user used for this food, copied from their message.")
    food_query: str = Field(description="The plain food name to look up: singular, no quantity, e.g. 'chapati', 'chicken curry', 'rice'.")
    quantity: float | None = Field(description="The number the user stated. null if they gave no amount. Never guess one.")
    unit: str | None = Field(description="The unit word the user used (g, kg, ml, piece, slice, bowl, katori, cup, glass, plate, tbsp, tsp, scoop, handful). null if none was stated.")
    quantity_is_vague: bool = Field(description="True for amounts like 'some', 'a little', 'a lot' that have no usable number.")


class ParsedMealFromLLMSchema(BaseModel):
    meal_type: MealType | None = Field(description="The meal the user named, or null if they did not name one.")
    items: list[ParsedFoodItemFromLLMSchema]


class MealOperationFromLLMSchema(BaseModel):
    action: Literal["set_quantity", "remove", "add", "set_meal_type", "replace_food"]
    item_index: int | None = Field(description="0-based index of the existing item this applies to. null for 'add' and 'set_meal_type'.")
    food_query: str | None = Field(description="Food name for 'add' or 'replace_food'. Otherwise null.")
    quantity: float | None = Field(description="New amount for 'set_quantity' or 'add'. Otherwise null.")
    unit: str | None = Field(description="Unit for the new amount, or null to keep the current unit.")
    meal_type: MealType | None = Field(description="New meal for 'set_meal_type'. Otherwise null.")


class RevisedMealFromLLMSchema(BaseModel):
    understood: bool = Field(description="False if the message does not describe a change to this meal.")
    operations: list[MealOperationFromLLMSchema]


class MealIdeaItemFromLLMSchema(BaseModel):
    food_id: int = Field(description="The id of a food from the list you were given. Never an id that is not in the list.")
    quantity: float = Field(description="How much of the food, counted in the unit below: a normal serving for one person.")
    unit: str = Field(description="One of that food's own units from the list, such as 'piece', 'bowl' or 'g'.")


class MealIdeaFromLLMSchema(BaseModel):
    title: str = Field(description="A short name for the meal, such as 'Paneer bhurji with chapati'.")
    why: str = Field(description="One short sentence, under 20 words, on why this suits the person right now. No numbers.")
    items: list[MealIdeaItemFromLLMSchema]


class MealCoachFromLLMSchema(BaseModel):
    ideas: list[MealIdeaFromLLMSchema]
