"""The Meal Coach agent: suggests what to eat at the next meal, as ideas the user can add to the diary in one tap.

Division of labour:
  - code picks the meal, turns what is left of today's targets into a budget for that one meal, and offers only foods this
    person can eat (their allergies, diet and dislikes), ranked by what they eat often and like;
  - the LLM (or, when it is unavailable, a rule-based builder) only chooses foods and amounts and says why they suit the person;
  - code checks every food and unit, rounds the amounts, scales them to the budget and computes all the nutrition.
The newest set of ideas is kept per person for three hours, so every device shows the same ones. An idea becomes food in the
diary only when the person adds it.
"""

import logging
import random
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import as_utc, now_ist, today_ist
from app.core.exceptions import NotFoundError, TokenLimitReachedError, ValidationError
from app.llm.knowledge_base import DIET_COACH_SYSTEM_INSTRUCTION, build_diet_coach_user_prompt
from app.models.diet_coach_suggestion import DietCoachSuggestionDBM
from app.models.diet_profile import DietProfileDBM
from app.models.food import FoodDBM
from app.models.user import UserDBM
from app.schemas.diet import (
    DISCLAIMER,
    DiaryAddRequest,
    LogItemRequest,
    MealCoachCurrentResponse,
    MealCoachFromLLMSchema,
    MealCoachRequest,
    MealCoachResponse,
    MealIdeaItemResponse,
    MealIdeaResponse,
    NutrientTotals,
    SHOWN_TITLES_KEPT,
)
from app.services import diet_agent_service, diet_calc_service, diet_diary_service, diet_food_service
from app.services.diet_calc_service import Nutrients
from app.services.diet_diary_service import STANDARD_MEAL_TYPES

_logger = logging.getLogger(__name__)

AGENT_MEAL_COACH = "meal_coach"
IDEAS_WANTED = 3
_KEEP_FOR = timedelta(hours=3)  # the ideas stay on every device this long, unless new ones are asked for first
_SHOWN_IN_PROMPT = 12  # the most recent of them the model is shown, so a long run of "different ideas" stays small
# Stays under the browser's wait for this request (TIMING.DIET_COACH_TIMEOUT_MS), so the fallback ideas can still arrive.
_LLM_TIMEOUT_SECONDS = 45
_LLM_ATTEMPTS = 1  # a second wait on a slow provider is worse than the fallback ideas
# Picking foods from a list needs no long thinking, but reasoning models think for a long time by default: that made a suggestion
# take 40 to 90 seconds and cost thousands of output tokens. Three short ideas fit well inside the ceiling below.
_LLM_REASONING_EFFORT = "minimal"
# A ceiling on the whole answer, thinking included. Set generously: some providers count their own thinking against it, and an
# answer cut off there would fall back to quick ideas. Three short ideas are a few hundred tokens, so this only stops a runaway reply.
_LLM_MAX_OUTPUT_TOKENS = 4000
_HISTORY_DAYS = 30
_RECENT_SLOT_DAYS = 3
_CANDIDATES_FOR_LLM = 70
_PER_CATEGORY_FOR_LLM = 10
_MIN_BUDGET_KCAL = 150
_MAX_SHARE_FACTOR = 1.25  # no one meal is aimed at more than this many times its usual share of the daily target

# How much of a day's food each standard meal usually carries. It turns "what is left today" into "what this meal should be".
_MEAL_SHARE = {"breakfast": 0.25, "morning_snack": 0.10, "lunch": 0.30, "evening_snack": 0.10, "dinner": 0.25}
# The meals a person eats, by how many meals a day they said they eat. The rest are not counted when sharing out what is left.
_SLOTS_BY_MEALS_PER_DAY = {
    1: ("dinner",),
    2: ("lunch", "dinner"),
    3: ("breakfast", "lunch", "dinner"),
    4: ("breakfast", "lunch", "evening_snack", "dinner"),
}

# Library entries that are ingredients or treats rather than something to suggest as a meal.
_NOT_A_MEAL_CATEGORIES = {"supplement", "oil_fat", "sweet"}
_NOT_A_MEAL_SLUGS = {
    "rice-raw", "atta", "chicken-breast-raw", "toor-dal-raw", "french-fries", "pizza-cheese", "burger-chicken", "noodles-instant", "cola",
    "juice-orange", "vada-pav", "samosa", "pakora",
}


_MAIN_MEALS = ("lunch", "dinner")
_NOT_FOR_MAIN_MEALS = {"beverage", "snack"}  # tea, biscuits and the like are snack foods
_DRINKS_FOR_MAIN_MEALS = {"buttermilk"}


@dataclass(frozen=True)
class _Line:
    food: FoodDBM
    quantity: float
    unit: str


# ---------- the meal and its budget ----------


def _slots_for(profile: DietProfileDBM) -> tuple[str, ...]:
    return _SLOTS_BY_MEALS_PER_DAY.get(profile.meals_per_day, STANDARD_MEAL_TYPES)


def next_meal_type(logged: set[str], moment: datetime, slots: tuple[str, ...]) -> str:
    """The meal to suggest: the one that fits the hour, or the next one the person eats that is not logged yet."""
    suggested = diet_diary_service.infer_meal_type(moment)
    start = STANDARD_MEAL_TYPES.index(suggested)
    for meal in STANDARD_MEAL_TYPES[start:]:
        if meal in slots and meal not in logged:
            return meal
    for meal in STANDARD_MEAL_TYPES:
        if meal in slots and meal not in logged:
            return meal
    return suggested


def _meal_budget(profile: DietProfileDBM, remaining: Nutrients, meal_type: str, logged: set[str], slots: tuple[str, ...]) -> Nutrients:
    """This meal's share of what is left today. Meals before it that were skipped are not made up for."""
    position = STANDARD_MEAL_TYPES.index(meal_type)
    counted = {meal for meal in slots if meal not in logged and STANDARD_MEAL_TYPES.index(meal) >= position} | {meal_type}
    share = _MEAL_SHARE[meal_type] / sum(_MEAL_SHARE[meal] for meal in counted)
    # Asking about a meal after the others are logged would otherwise hand it the whole rest of the day.
    cap = profile.calorie_target * _MEAL_SHARE[meal_type] * _MAX_SHARE_FACTOR
    if remaining.calories * share > cap:
        share = cap / remaining.calories
    budget = Nutrients(
        round(max(remaining.calories, 0) * share), round(max(remaining.protein_g, 0) * share, 1), round(max(remaining.carbs_g, 0) * share, 1),
        round(max(remaining.fat_g, 0) * share, 1), round(max(remaining.fibre_g, 0) * share, 1),
    )
    if budget.calories >= _MIN_BUDGET_KCAL:
        return budget
    # Almost nothing is left, or nothing: suggest a small, light meal in the same proportions as the person's targets.
    per_kcal = 1 / profile.calorie_target if profile.calorie_target else 0
    return Nutrients(
        _MIN_BUDGET_KCAL, round(profile.protein_target_g * per_kcal * _MIN_BUDGET_KCAL, 1), round(profile.carbs_target_g * per_kcal * _MIN_BUDGET_KCAL, 1),
        round(profile.fat_target_g * per_kcal * _MIN_BUDGET_KCAL, 1), round(profile.fibre_target_g * per_kcal * _MIN_BUDGET_KCAL, 1),
    )


# ---------- the foods on offer ----------


def _candidates(db: Session, user: UserDBM, profile: DietProfileDBM) -> list[FoodDBM]:
    """Foods this person can be offered: library and own foods as they see them, minus anything their restrictions rule out."""
    overlays = diet_food_service.overlays_for(db, user)
    foods: list[FoodDBM] = []
    for row in db.scalars(select(FoodDBM).where(diet_food_service.visible_to(user))).all():
        if row.category in _NOT_A_MEAL_CATEGORIES or row.slug in _NOT_A_MEAL_SLUGS:
            continue
        food = diet_food_service.apply_overlay(row, overlays.get(row.id))
        if diet_food_service.restriction_warnings(profile, food):  # allergy, intolerance, diet or dislike
            continue
        foods.append(food)
    return foods


@dataclass(frozen=True)
class _History:
    frequency: Counter  # food id -> times eaten in the last month
    recent_by_meal: dict[str, dict[int, str]]  # meal type -> foods eaten at it in the last few days (id -> name)
    eaten_today_ids: set[int]
    eaten_today: list[str]
    eaten_often: list[str]
    logged_today: set[str]  # meal types already logged today
    consumed_today: Nutrients

    def recent_at(self, meal_type: str) -> dict[int, str]:
        return self.recent_by_meal.get(meal_type, {})


def _history(db: Session, user: UserDBM, today) -> _History:
    logs = diet_diary_service.logs_for(db, user, today - timedelta(days=_HISTORY_DAYS), today)
    frequency: Counter = Counter()
    names: dict[int, str] = {}
    recent_by_meal: dict[str, dict[int, str]] = {}
    today_items = []
    for log in logs:
        recent = today - timedelta(days=_RECENT_SLOT_DAYS) <= log.log_date < today
        for item in log.items:
            if item.food_id is not None:
                frequency[item.food_id] += 1
                names[item.food_id] = item.name
                if recent:
                    recent_by_meal.setdefault(log.meal_type, {})[item.food_id] = item.name
            if log.log_date == today:
                today_items.append(item)
    return _History(
        frequency=frequency,
        recent_by_meal=recent_by_meal,
        eaten_today_ids={item.food_id for item in today_items if item.food_id is not None},
        eaten_today=list(dict.fromkeys(item.name for item in today_items)),
        eaten_often=[names[food_id] for food_id, _ in frequency.most_common(12)],
        logged_today={log.meal_type for log in logs if log.log_date == today},
        consumed_today=diet_diary_service.totals_of(today_items),
    )


def _rank(foods: list[FoodDBM], profile: DietProfileDBM, history: _History, meal_type: str, favourites: set[int]) -> list[tuple[FoodDBM, float]]:
    """Each food with a score: liked, favourite and familiar foods first, repeats of the last few days and today lower, protein-dense higher."""
    liked = [word.lower().strip() for word in profile.liked_foods if word.strip()]
    cuisines = " ".join(profile.cuisines).lower()
    recent_here = history.recent_at(meal_type)
    ranked = []
    for food in foods:
        score = 1.0 + min(history.frequency[food.id], 6) * 0.5
        score += 1.5 if food.id in favourites else 0
        score += 2.0 if any(word in food.search_text for word in liked) else 0
        score += 0.7 if food.cuisine and food.cuisine in cuisines else 0
        score -= 1.5 if food.id in recent_here else 0
        score -= 1.0 if food.id in history.eaten_today_ids else 0
        score += 2.0 * (food.protein_g * 4 / food.calories) if food.calories > 0 else 0
        ranked.append((food, max(score, 0.1)))
    return sorted(ranked, key=lambda pair: -pair[1])


# ---------- amounts ----------


def _usual_grams(food: FoodDBM) -> float:
    try:
        return diet_calc_service.to_grams(food.default_quantity, food.default_unit, food.serving_grams)
    except ValidationError:
        return 100.0


def _round_quantity(quantity: float, unit: str, food: FoodDBM) -> float:
    if unit == "g":
        return float(max(5, round(quantity / 5) * 5))
    step = 1.0 if food.default_quantity >= 4 else 0.5  # a handful of almonds goes by ones, a bowl by halves
    return max(step, round(quantity / step) * step)


def _line(food: FoodDBM, quantity: float, unit: str) -> _Line | None:
    """A cleaned amount of a food, or None when the unit is not one this food has. Amounts far from a normal serving are pulled back."""
    key = unit.strip().lower()
    try:
        grams = diet_calc_service.to_grams(quantity, key, food.serving_grams)
    except ValidationError:
        return None
    if key in diet_calc_service.FIXED_GRAM_UNITS:
        key, quantity = "g", grams
    usual = _usual_grams(food)
    low, high = max(10.0, usual * 0.25), min(600.0, usual * 3.0)
    if grams < low or grams > high:
        quantity *= min(max(grams, low), high) / grams
    return _Line(food, _round_quantity(quantity, key, food), key)


def _usual_line(food: FoodDBM) -> _Line:
    return _line(food, food.default_quantity, food.default_unit) or _Line(food, 100.0, "g")


def _nutrients(line: _Line) -> tuple[float, Nutrients]:
    return diet_food_service.nutrients_for(line.food, line.quantity, line.unit)


def _total(lines: list[_Line]) -> Nutrients:
    return diet_calc_service.sum_nutrients([_nutrients(line)[1] for line in lines])


def _fit(lines: list[_Line], budget_kcal: float, floor: float = 0.55) -> list[_Line] | None:
    """The same foods in amounts that land near the calorie budget, or None when they cannot get close without silly portions.
    `floor` is how far under the budget an idea may stay."""
    total = _total(lines).calories
    if total <= 0:
        return None
    if 0.8 * budget_kcal <= total <= 1.1 * budget_kcal:
        return lines
    factor = min(max(budget_kcal * 0.97 / total, 0.5), 1.8)
    scaled = [_line(line.food, line.quantity * factor, line.unit) or line for line in lines]
    return scaled if floor * budget_kcal <= _total(scaled).calories <= 1.2 * budget_kcal else None


# ---------- ideas ----------


def _natural(lines: list[_Line]) -> bool:
    """Whether every amount is close to a normal serving, so an idea does not ask for half a paratha or three bowls of curry."""
    for line in lines:
        ratio = _nutrients(line)[0] / _usual_grams(line.food)
        if not 0.7 <= ratio <= 2.2:
            return False
    return True


def _title_of(lines: list[_Line]) -> str:
    names = [line.food.name for line in lines]
    return names[0] if len(names) == 1 else f"{names[0]} with {' and '.join(names[1:])}"


def _basic_why(totals: Nutrients, budget: Nutrients) -> str:
    if budget.protein_g > 0 and totals.protein_g >= 0.85 * budget.protein_g:
        return "Covers most of the protein you still need for this meal."
    if totals.fibre_g >= max(5.0, 0.8 * budget.fibre_g):
        return "A fibre-rich plate that keeps you full."
    return "Fits the calories you have left for this meal."


def _idea(lines: list[_Line], title: str, why: str, source: str) -> MealIdeaResponse:
    items = []
    for line in lines:
        grams, nutrients = _nutrients(line)
        items.append(
            MealIdeaItemResponse(
                food_id=line.food.id, name=line.food.name, quantity=line.quantity, unit=line.unit, grams=grams,
                nutrients=NutrientTotals(**vars(nutrients)),
            )
        )
    return MealIdeaResponse(title=title, why=why, source=source, items=items, totals=NutrientTotals(**vars(_total(lines))))  # type: ignore[arg-type]


def _ideas_from_llm(parsed: MealCoachFromLLMSchema, by_id: dict[int, FoodDBM], budget: Nutrients, skip_titles: set[str]) -> list[MealIdeaResponse]:
    """The model's ideas, kept only where every food is one it was offered, in amounts code could check and fit."""
    ideas: list[MealIdeaResponse] = []
    seen_sets: set[frozenset[int]] = set()
    for raw in parsed.ideas[:6]:
        lines: list[_Line] = []
        for item in raw.items[:5]:
            food = by_id.get(item.food_id)
            if food is None or any(line.food.id == food.id for line in lines):
                continue
            lines.append(_line(food, item.quantity, item.unit) or _usual_line(food))
        fitted = _fit(lines, budget.calories) if lines else None
        if fitted is None:
            continue
        food_set = frozenset(line.food.id for line in fitted)
        title = (raw.title or "").strip()[:120] or _title_of(fitted)
        if food_set in seen_sets or title.lower() in skip_titles:
            continue
        seen_sets.add(food_set)
        ideas.append(_idea(fitted, title, (raw.why or "").strip()[:200] or _basic_why(_total(fitted), budget), "ai"))
        if len(ideas) == IDEAS_WANTED:
            break
    return ideas


def _pool(*, categories: tuple[str, ...] = (), slugs: tuple[str, ...] = (), exclude: tuple[str, ...] = ()):
    return lambda food: food.slug not in exclude and (food.category in categories or food.slug in slugs)


_BREAKFAST_MAIN = _pool(slugs=("idli", "dosa-plain", "uttapam", "poha", "upma", "oats-cooked", "besan-chilla", "paratha-plain", "chapati", "bread-brown", "masala-dosa"))
_BREAKFAST_SIDE = _pool(categories=("egg", "dairy"), slugs=("sprouts-moong", "paneer-bhurji"), exclude=("cheese-cheddar", "cheese-slice", "raita"))
_FRUIT = _pool(categories=("fruit",), exclude=("avocado", "dates"))
_CARB = _pool(slugs=("chapati", "roti-ghee", "naan", "paratha-plain", "rice-brown", "rice-white", "jeera-rice", "veg-pulao", "quinoa-cooked", "bread-brown"))
_MAIN = _pool(
    categories=("dal", "legume", "egg", "meat", "fish"),
    slugs=("paneer", "paneer-bhurji", "palak-paneer", "paneer-butter-masala"),
    exclude=("hummus", "chickpeas-boiled", "fish-fried", "butter-chicken", "dal-makhani"),
)
_SIDE = _pool(categories=("vegetable",), slugs=("raita", "curd", "buttermilk"), exclude=("potato-boiled", "sweet-potato", "onion", "tomato", "peas-cooked"))
_ONE_DISH = _pool(slugs=("dal-khichdi", "veg-biryani", "chicken-biryani", "veg-pulao"))
_LIGHT_BITE = _pool(
    categories=("fruit", "nuts_seeds"),
    slugs=("curd", "curd-low-fat", "greek-yogurt", "makhana", "roasted-chana", "khakhra", "dhokla", "sprouts-moong", "hummus", "milk-toned", "milk-skimmed"),
    exclude=("avocado", "dates", "peanut-butter", "chia-seeds"),
)
_LIGHT_DRINK = _pool(slugs=("green-tea", "chai", "buttermilk", "coconut-water"))

# What a plate looks like at each meal, as the kinds of food it is built from.
_RECIPES: dict[str, list[list]] = {
    "breakfast": [[_BREAKFAST_MAIN, _BREAKFAST_SIDE, _FRUIT], [_BREAKFAST_MAIN, _BREAKFAST_SIDE]],
    "lunch": [[_CARB, _MAIN, _SIDE], [_ONE_DISH, _SIDE], [_CARB, _MAIN]],
    "dinner": [[_CARB, _MAIN, _SIDE], [_ONE_DISH, _SIDE], [_CARB, _MAIN]],
    "morning_snack": [[_LIGHT_BITE, _LIGHT_DRINK], [_FRUIT, _LIGHT_BITE]],
    "evening_snack": [[_LIGHT_BITE, _LIGHT_DRINK], [_FRUIT, _LIGHT_BITE]],
}


def _basic_ideas(
    ranked: list[tuple[FoodDBM, float]], meal_type: str, budget: Nutrients, skip_titles: set[str], skip_sets: set[frozenset[int]], rng: random.Random, wanted: int
) -> list[MealIdeaResponse]:
    """Ideas put together by code alone, from the same ranked foods: one food per part of a typical plate at this meal."""
    ideas: list[MealIdeaResponse] = []
    firsts: set[int] = set()
    for attempt in range(60):
        if len(ideas) >= wanted:
            break
        # Ideas with natural portions come first; light or stretched ones are accepted only once those have run out.
        floor = 0.55 if attempt < 40 else 0.35
        strict = attempt < 40
        lines: list[_Line] = []
        for pool in rng.choice(_RECIPES[meal_type]):
            options = [(food, score) for food, score in ranked if pool(food) and all(line.food.id != food.id for line in lines)]
            if not options:
                lines = []
                break
            food = rng.choices([food for food, _ in options], weights=[score for _, score in options])[0]
            lines.append(_usual_line(food))
        fitted = _fit(lines, budget.calories, floor) if lines else None
        if fitted is None or (strict and not _natural(fitted)):
            continue
        food_set = frozenset(line.food.id for line in fitted)
        title = _title_of(fitted)
        if fitted[0].food.id in firsts or food_set in skip_sets or title.lower() in skip_titles:
            continue
        firsts.add(fitted[0].food.id)
        skip_sets.add(food_set)
        ideas.append(_idea(fitted, title, _basic_why(_total(fitted), budget), "basic"))
    return ideas


# ---------- the request ----------


def _person_summary(profile: DietProfileDBM) -> dict[str, object]:
    summary: dict[str, object] = {
        "Eating style": profile.dietary_preference.replace("_", " "),
        "Goal": profile.objective.replace("_", " "),
        "Cooking time available": profile.cooking_availability,
    }
    if profile.allergies or profile.intolerances:
        summary["Must avoid"] = ", ".join([*profile.allergies, *profile.intolerances])
    if profile.disliked_foods:
        summary["Dislikes"] = ", ".join(profile.disliked_foods)
    if profile.liked_foods:
        summary["Likes"] = ", ".join(profile.liked_foods)
    if profile.cuisines:
        summary["Favourite cuisines"] = ", ".join(profile.cuisines)
    if profile.daily_budget:
        summary["Wants affordable food"] = "yes, a daily food budget is set"
    return summary


def _llm_foods(ranked: list[tuple[FoodDBM, float]], meal_type: str) -> list[FoodDBM]:
    """The best-ranked foods, a few of each kind, so the model sees variety and not forty breads."""
    taken: Counter = Counter()
    chosen: list[FoodDBM] = []
    for food, _ in ranked:
        if meal_type in _MAIN_MEALS and food.category in _NOT_FOR_MAIN_MEALS and food.slug not in _DRINKS_FOR_MAIN_MEALS:
            continue
        if taken[food.category] >= _PER_CATEGORY_FOR_LLM:
            continue
        taken[food.category] += 1
        chosen.append(food)
        if len(chosen) == _CANDIDATES_FOR_LLM:
            break
    return chosen


def _food_row(food: FoodDBM) -> dict:
    """What the model needs to choose a food and an amount: the usual serving, its calories, protein and fibre, and the units it can use.
    The nutrition itself is worked out again in code afterwards, so the model is not asked to do any arithmetic."""
    grams = _usual_grams(food)
    serving = diet_calc_service.scale_per_100g(Nutrients(food.calories, food.protein_g, food.carbs_g, food.fat_g, food.fibre_g), grams)
    usual = f"{grams:g} g" if food.default_unit == "g" else f"{diet_calc_service.round1(food.default_quantity):g} {food.default_unit} ({grams:g} g)"
    return {
        "id": food.id,
        "name": food.name,
        "category": food.category,
        "usual": usual,
        "per_usual": {"calories": serving.calories, "protein_g": serving.protein_g, "fibre_g": serving.fibre_g},
        "units": ["g", *[unit for unit in food.serving_grams if unit != "g"]],
    }


def _label(meal_type: str) -> str:
    return meal_type.replace("_", " ").capitalize()


async def suggest(db: Session, user: UserDBM, request: MealCoachRequest) -> MealCoachResponse:
    profile = db.get(DietProfileDBM, user.id)
    if profile is None:
        raise NotFoundError("Set up your nutrition profile first.")
    today = today_ist()
    slots = _slots_for(profile)
    history = _history(db, user, today)
    meal_type = request.meal_type or next_meal_type(history.logged_today, now_ist(), slots)

    eaten = history.consumed_today
    remaining = Nutrients(
        diet_calc_service.round1(profile.calorie_target - eaten.calories), diet_calc_service.round1(profile.protein_target_g - eaten.protein_g),
        diet_calc_service.round1(profile.carbs_target_g - eaten.carbs_g), diet_calc_service.round1(profile.fat_target_g - eaten.fat_g),
        diet_calc_service.round1(profile.fibre_target_g - eaten.fibre_g),
    )
    budget = _meal_budget(profile, remaining, meal_type, history.logged_today, slots)
    over_target = remaining.calories <= 0

    ranked = _rank(_candidates(db, user, profile), profile, history, meal_type, diet_food_service.favourite_ids(db, user))
    skip_titles = {title.lower() for title in request.exclude}
    ideas: list[MealIdeaResponse] = []
    limit_reached = False

    if ranked:
        offered = _llm_foods(ranked, meal_type)
        try:
            parsed, _run = await diet_agent_service.ask_llm(
                db, user, agent=AGENT_MEAL_COACH, system=DIET_COACH_SYSTEM_INSTRUCTION, schema=MealCoachFromLLMSchema, operation="diet_meal_coach",
                timeout=_LLM_TIMEOUT_SECONDS, attempts=_LLM_ATTEMPTS,
                max_tokens=_LLM_MAX_OUTPUT_TOKENS, reasoning_effort=_LLM_REASONING_EFFORT,
                content=build_diet_coach_user_prompt(
                    meal_label=_label(meal_type), budget=vars(budget), remaining={k: max(v, 0) for k, v in vars(remaining).items()},
                    person=_person_summary(profile), eaten_today=history.eaten_today, eaten_often=history.eaten_often,
                    recent_same_meal=list(history.recent_at(meal_type).values())[:10], note=request.note,
                    already_suggested=request.exclude[-_SHOWN_IN_PROMPT:],
                    foods=[_food_row(food) for food in offered],
                ),
            )
            if isinstance(parsed, MealCoachFromLLMSchema):
                ideas = _ideas_from_llm(parsed, {food.id: food for food in offered}, budget, skip_titles)
        except TokenLimitReachedError:
            limit_reached = True
        except Exception:  # whatever the model sent, the person still gets ideas
            _logger.exception("Meal coach could not use the model's answer")
        if len(ideas) < IDEAS_WANTED:
            rng = random.Random(f"{user.id}:{today}:{meal_type}:{len(request.exclude)}")
            ideas += _basic_ideas(
                ranked, meal_type, budget, skip_titles | {idea.title.lower() for idea in ideas},
                {frozenset(item.food_id for item in idea.items) for idea in ideas}, rng, IDEAS_WANTED - len(ideas),
            )
    db.commit()  # keeps the run record

    notice = None
    if not ranked:
        notice = "None of the foods in your library fit your preferences and restrictions yet. Add foods you eat in the Food library."
    elif limit_reached:
        notice = (
            "Your AI allowance for this month is used up, so these are quick ideas from your food library. Subscribe under Profile for AI ideas."
            if ideas else "Your AI allowance for this month is used up. Subscribe under Profile for AI ideas."
        )
    elif over_target:
        notice = "You've reached today's calorie target, so these are light options."
    elif not ideas:
        notice = "Couldn't put together ideas right now. Try again in a moment."
    return MealCoachResponse(
        meal_type=meal_type,
        remaining=NutrientTotals(**vars(remaining)),
        budget=NutrientTotals(**vars(budget)),
        over_target=over_target,
        ideas=ideas,
        notice=notice,
        disclaimer=DISCLAIMER,
        ai_limit_reached=limit_reached,
    )


# ---------- the ideas kept for every device ----------


def _saved(db: Session, user: UserDBM) -> DietCoachSuggestionDBM | None:
    """The person's current ideas, or None when there are none, or they have expired or belong to an earlier day. Such rows are removed."""
    row = db.get(DietCoachSuggestionDBM, user.id)
    if row is None:
        return None
    if as_utc(row.expires_at) <= datetime.now(timezone.utc) or row.day != today_ist():
        db.delete(row)
        db.commit()
        return None
    return row


def _described(row: DietCoachSuggestionDBM) -> MealCoachCurrentResponse:
    left = as_utc(row.expires_at) - datetime.now(timezone.utc)
    return MealCoachCurrentResponse(
        meal=row.meal,
        note=row.note,
        result=MealCoachResponse.model_validate(row.result),
        shown=row.shown,
        added=row.added,
        expires_in_seconds=max(int(left.total_seconds()), 0),
    )


def _save(db: Session, user_id: int, values: dict) -> DietCoachSuggestionDBM:
    """Stores the person's ideas in place of any earlier ones. Two devices asking at the same moment cannot both insert a row: the
    one that loses the race merges into the row the other one wrote."""
    try:
        row = db.merge(DietCoachSuggestionDBM(user_id=user_id, **values))
        db.commit()
    except IntegrityError:
        db.rollback()
        row = db.merge(DietCoachSuggestionDBM(user_id=user_id, **values))
        db.commit()
    return row


def current(db: Session, user: UserDBM) -> MealCoachCurrentResponse | None:
    row = _saved(db, user)
    return _described(row) if row is not None else None


def _recent(titles: list[str]) -> list[str]:
    """The newest titles, each once, as many as are remembered for "different ideas"."""
    return list(dict.fromkeys(titles))[-SHOWN_TITLES_KEPT:]


def _carried(previous: DietCoachSuggestionDBM | None, request: MealCoachRequest) -> list[str]:
    """What the new ideas must not repeat. "Different ideas" carries on from everything offered recently, on any device; a fresh
    request starts again from nothing."""
    if not request.exclude:
        return []
    earlier = previous.shown if previous is not None else []
    return _recent([*earlier, *request.exclude])


def _next_midnight() -> datetime:
    """The coming midnight in IST, as UTC. The ideas are for today, so they stop counting then, even when they are not yet three hours old."""
    now = now_ist()
    tomorrow = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=now.tzinfo)
    return tomorrow.astimezone(timezone.utc)


async def suggest_for_card(db: Session, user: UserDBM, request: MealCoachRequest) -> MealCoachCurrentResponse:
    """New ideas for the diary page: made now, kept for every device until they expire, and returned as they were saved."""
    previous = _saved(db, user)
    carried = _carried(previous, request)
    result = await suggest(db, user, request.model_copy(update={"exclude": carried}))
    created = datetime.now(timezone.utc)
    row = _save(db, user.id, {
        "day": today_ist(),
        "meal": request.meal_type or "auto",
        "note": request.note or "",
        "result": result.model_dump(mode="json"),
        "shown": _recent([*carried, *(idea.title for idea in result.ideas)]),
        "added": [],
        "created_at": created,
        "expires_at": min(created + _KEEP_FOR, _next_midnight()),
    })
    return _described(row)


def add_idea(db: Session, user: UserDBM, index: int, title: str) -> MealCoachCurrentResponse:
    """Puts one of the saved ideas into the diary. The title is the one the person saw at that index, so an idea is never added in
    place of a different one after another device replaced the list. An idea already in, from this device or another, is not added twice."""
    row = _saved(db, user)
    if row is None:
        raise NotFoundError("These ideas have expired. Ask the coach for new ones.")
    ideas = row.result["ideas"]
    if not 0 <= index < len(ideas) or ideas[index]["title"] != title:
        raise NotFoundError("That idea is no longer in the list. Ask the coach for new ones.")
    idea = ideas[index]
    if title in row.added:
        return _described(row)
    # The tokens belong to these ideas, so the diary's own duplicate check stops the same item going in twice, even from two devices.
    stamp = int(as_utc(row.created_at).timestamp() * 1000)
    diet_diary_service.add_items(db, user, DiaryAddRequest(
        meal_type=row.result["meal_type"],
        items=[
            LogItemRequest(food_id=item["food_id"], quantity=item["quantity"], unit=item["unit"], client_token=f"coach-{stamp}-{index}-{position}")
            for position, item in enumerate(idea["items"])
        ],
    ))
    row.added = [*row.added, title]
    db.commit()
    return _described(row)
