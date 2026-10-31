"""Deterministic nutrition maths for Diet. No database and no LLM: every number the app shows or stores comes from here.

Targets computed here are estimates (source "estimated"). Nothing in this module writes or overwrites a user's saved targets.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.core.exceptions import ValidationError

SEXES = ("male", "female")
OBJECTIVES = ("fat_loss", "muscle_gain", "maintenance", "wellness", "custom")

ACTIVITY_FACTORS: dict[str, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

# Safety limits. Estimates never go below the floor or beyond the deficit cap, whatever the objective.
CALORIE_FLOOR = {"male": 1500, "female": 1200}
MAX_DEFICIT_FRACTION = 0.25  # of TDEE
MAX_DEFICIT_KCAL = 750
FAT_LOSS_DEFICIT_FRACTION = 0.18
MUSCLE_GAIN_SURPLUS_FRACTION = 0.10

KCAL_PER_G = {"protein": 4.0, "carbs": 4.0, "fat": 9.0}

# Household measures are only approximate grams, so an amount in them is recorded as an estimate.
APPROXIMATE_UNITS = frozenset({"bowl", "katori", "plate", "handful"})
MAX_GRAMS = 10000.0  # one entry above this is a typo, not a meal
MAX_ESTIMATED_CALORIES = 6000
UNDER_18_OR_LOW_BMI_NOTE = (
    "Weight-loss targets aren't suggested under 18 or at a low body weight, so this is a maintenance estimate. "
    "Please talk to a doctor or dietitian about your goals."
)


def certainty_for_unit(unit: str) -> str:
    return "estimated" if unit.strip().lower() in APPROXIMATE_UNITS else "exact"


# Rounding rule for stored nutrient values: one decimal place, half up (so 2.25 -> 2.3, not banker's 2.2).
_ONE_DP = Decimal("0.1")


def round1(value: float) -> float:
    return float(Decimal(str(value)).quantize(_ONE_DP, rounding=ROUND_HALF_UP))


@dataclass(frozen=True)
class EstimatedTargets:
    bmr: float
    tdee: float
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int
    fibre_g: int
    water_ml: int
    notes: tuple[str, ...]  # why a number was adjusted; shown to the user alongside the estimate


def calc_bmr(*, sex: str, weight_kg: float, height_cm: float, age: int) -> float:
    """Mifflin-St Jeor: 10*kg + 6.25*cm - 5*age + 5 (male) or - 161 (female)."""
    if sex not in SEXES:
        raise ValidationError("Sex is needed for the calorie estimate.", errors={"sex": "Choose male or female."})
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    return round1(base + (5 if sex == "male" else -161))


def calc_tdee(bmr: float, activity_level: str) -> float:
    factor = ACTIVITY_FACTORS.get(activity_level)
    if factor is None:
        raise ValidationError("Unknown activity level.", errors={"activity_level": "Choose one of the listed levels."})
    return round1(bmr * factor)


def estimate_targets(
    *,
    sex: str,
    age: int,
    height_cm: float,
    weight_kg: float,
    activity_level: str,
    objective: str,
) -> EstimatedTargets:
    """Estimated daily targets. Protein, fat and fibre scale with body weight and calories; carbs fill what is left."""
    if objective not in OBJECTIVES:
        raise ValidationError("Unknown objective.", errors={"objective": "Choose one of the listed objectives."})

    notes: list[str] = []
    bmr = calc_bmr(sex=sex, weight_kg=weight_kg, height_cm=height_cm, age=age)
    tdee = calc_tdee(bmr, activity_level)

    bmi = weight_kg / ((height_cm / 100) ** 2)
    if objective == "fat_loss" and (age < 18 or bmi < 18.5):
        objective = "maintenance"  # never suggest a deficit for a minor or an underweight adult
        notes.append(UNDER_18_OR_LOW_BMI_NOTE)

    if objective == "fat_loss":
        deficit = min(tdee * FAT_LOSS_DEFICIT_FRACTION, tdee * MAX_DEFICIT_FRACTION, MAX_DEFICIT_KCAL)
        calories = tdee - deficit
    elif objective == "muscle_gain":
        calories = tdee * (1 + MUSCLE_GAIN_SURPLUS_FRACTION)
    else:
        calories = tdee

    if calories > MAX_ESTIMATED_CALORIES:
        calories = MAX_ESTIMATED_CALORIES
        notes.append(f"Capped at {MAX_ESTIMATED_CALORIES:,} kcal. Please set your own target with a dietitian if you need more.")

    floor = CALORIE_FLOOR[sex]
    if calories < floor:
        calories = floor
        notes.append(f"Raised to {floor} kcal, the lowest daily intake this app will suggest without professional guidance.")

    protein_per_kg = {"fat_loss": 1.8, "muscle_gain": 1.8, "maintenance": 1.4, "wellness": 1.2, "custom": 1.4}[objective]
    protein_g = round(weight_kg * protein_per_kg)
    fat_g = round(calories * 0.25 / KCAL_PER_G["fat"])
    carb_kcal = calories - protein_g * KCAL_PER_G["protein"] - fat_g * KCAL_PER_G["fat"]
    if carb_kcal < calories * 0.20:
        # Very high protein relative to calories: trim protein so carbs stay at least 20% of calories.
        carb_kcal = calories * 0.20
        protein_g = round((calories - carb_kcal - fat_g * KCAL_PER_G["fat"]) / KCAL_PER_G["protein"])
        notes.append("Protein was reduced so carbohydrates stay at a sensible share of calories.")
    carbs_g = round(carb_kcal / KCAL_PER_G["carbs"])

    return EstimatedTargets(
        bmr=bmr,
        tdee=tdee,
        calories=round(calories),
        protein_g=protein_g,
        carbs_g=carbs_g,
        fat_g=fat_g,
        fibre_g=max(25, round(calories / 1000 * 14)),  # 14 g per 1000 kcal, with a 25 g minimum
        water_ml=round(weight_kg * 35 / 50) * 50,  # 35 ml/kg, rounded to 50 ml
        notes=tuple(notes),
    )


def validate_custom_calories(calories: int, *, sex: str | None, tdee: float | None) -> list[str]:
    """Warnings for a manually chosen calorie target. The user may still save it; only the floor and deficit are flagged."""
    warnings: list[str] = []
    if sex in CALORIE_FLOOR and calories < CALORIE_FLOOR[sex]:
        warnings.append(
            f"{calories} kcal is below {CALORIE_FLOOR[sex]} kcal a day. Please speak to a doctor or dietitian before eating this little."
        )
    if tdee and calories < tdee * (1 - MAX_DEFICIT_FRACTION):
        warnings.append("This is a deficit of more than 25% of your estimated daily needs, which is hard to sustain safely.")
    return warnings


# ---------- serving conversion ----------

# Weight/volume units a food can be measured in, expressed in grams (volume units assume the food's own density,
# so they are only used when the food record provides grams-per-unit; see to_grams).
FIXED_GRAM_UNITS = {"g": 1.0, "gram": 1.0, "grams": 1.0, "kg": 1000.0, "mg": 0.001, "oz": 28.3495}


def to_grams(quantity: float, unit: str, serving_grams: dict[str, float]) -> float:
    """Converts a quantity in `unit` to grams. `serving_grams` maps the food's own units ("piece", "bowl", "cup"...) to grams.

    Raises ValidationError for a unit the food has no conversion for. It never guesses a gram weight.
    """
    if quantity <= 0:
        raise ValidationError("Quantity must be more than zero.", errors={"quantity": "Enter an amount above zero."})
    key = unit.strip().lower()
    if key in FIXED_GRAM_UNITS:
        grams = round1(quantity * FIXED_GRAM_UNITS[key])
    elif key in serving_grams:
        grams = round1(quantity * serving_grams[key])
    else:
        grams = None
    if grams is not None:
        if grams <= 0:
            raise ValidationError("That amount is too small to log.", errors={"quantity": "Enter a larger amount."})
        if grams > MAX_GRAMS:
            raise ValidationError("That amount looks too large. Check the number and unit.", errors={"quantity": "Check the amount."})
        return grams
    raise ValidationError(f"This food has no '{unit}' serving.", errors={"unit": f"Use one of: {', '.join(sorted(serving_grams))} or grams."})


@dataclass(frozen=True)
class Nutrients:
    calories: float = 0.0
    protein_g: float = 0.0
    carbs_g: float = 0.0
    fat_g: float = 0.0
    fibre_g: float = 0.0

    def __add__(self, other: "Nutrients") -> "Nutrients":
        return Nutrients(
            round1(self.calories + other.calories),
            round1(self.protein_g + other.protein_g),
            round1(self.carbs_g + other.carbs_g),
            round1(self.fat_g + other.fat_g),
            round1(self.fibre_g + other.fibre_g),
        )


def scale_per_100g(per_100g: Nutrients, grams: float) -> Nutrients:
    """Nutrients for `grams` of a food whose values are stored per 100 g."""
    factor = grams / 100.0
    return Nutrients(
        round1(per_100g.calories * factor),
        round1(per_100g.protein_g * factor),
        round1(per_100g.carbs_g * factor),
        round1(per_100g.fat_g * factor),
        round1(per_100g.fibre_g * factor),
    )


def sum_nutrients(items: list[Nutrients]) -> Nutrients:
    total = Nutrients()
    for item in items:
        total = total + item
    return total


# ---------- daily nutrition score ----------

SCORE_WEIGHTS = {"calories": 35, "protein": 25, "fibre": 15, "variety": 10, "hydration": 15}


@dataclass(frozen=True)
class ScoreComponent:
    key: str
    points: float
    max_points: int
    explanation: str


def _ratio_score(value: float, target: float, *, tolerance: float = 0.10, floor_ratio: float = 0.5) -> float:
    """1.0 within `tolerance` of target, falling linearly to 0 at `floor_ratio` below or double the target."""
    if target <= 0:
        return 0.0
    ratio = value / target
    if abs(ratio - 1) <= tolerance:
        return 1.0
    if ratio < 1:
        return max(0.0, (ratio - floor_ratio) / (1 - tolerance - floor_ratio))
    return max(0.0, 1 - (ratio - 1 - tolerance) / (1 - tolerance))


def daily_score(
    *,
    total: Nutrients,
    calorie_target: float,
    protein_target: float,
    fibre_target: float,
    distinct_foods: int,
    water_ml: float,
    water_target_ml: float,
    has_logged_food: bool,
) -> tuple[int | None, list[ScoreComponent]]:
    """Explainable 0-100 score. Returns (None, []) when nothing was logged: a day with no entries is unknown, not a bad day.

    This is a habit-consistency aid, not a medical or dietary assessment.
    """
    if not has_logged_food:
        return None, []

    parts = [
        ScoreComponent(
            "calories",
            SCORE_WEIGHTS["calories"] * _ratio_score(total.calories, calorie_target),
            SCORE_WEIGHTS["calories"],
            f"{round(total.calories)} of {round(calorie_target)} kcal. Full marks within 10% of your target.",
        ),
        ScoreComponent(
            "protein",
            SCORE_WEIGHTS["protein"] * min(1.0, total.protein_g / protein_target) if protein_target > 0 else 0.0,
            SCORE_WEIGHTS["protein"],
            f"{round(total.protein_g)} of {round(protein_target)} g protein. Full marks at or above your target.",
        ),
        ScoreComponent(
            "fibre",
            SCORE_WEIGHTS["fibre"] * min(1.0, total.fibre_g / fibre_target) if fibre_target > 0 else 0.0,
            SCORE_WEIGHTS["fibre"],
            f"{round(total.fibre_g)} of {round(fibre_target)} g fibre. Full marks at or above your target.",
        ),
        ScoreComponent(
            "variety",
            SCORE_WEIGHTS["variety"] * min(1.0, distinct_foods / 8),
            SCORE_WEIGHTS["variety"],
            f"{distinct_foods} different foods. Full marks at 8 or more.",
        ),
        ScoreComponent(
            "hydration",
            SCORE_WEIGHTS["hydration"] * min(1.0, water_ml / water_target_ml) if water_target_ml > 0 else 0.0,
            SCORE_WEIGHTS["hydration"],
            f"{round(water_ml)} of {round(water_target_ml)} ml water. Full marks at or above your target.",
        ),
    ]
    rounded = [ScoreComponent(p.key, round1(p.points), p.max_points, p.explanation) for p in parts]
    return round(sum(p.points for p in rounded)), rounded
