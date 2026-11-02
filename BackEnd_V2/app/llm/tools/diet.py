from collections import Counter, defaultdict
from datetime import date, timedelta
from enum import Enum, StrEnum
from typing import Callable

from sqlalchemy import select

from app.common import today_ist
from app.llm.tools.context import ToolContext
from app.models.diet_profile import DietProfileDBM
from app.models.water_log import WaterLogDBM

_NO_PROFILE = {
    "profile_set_up": False,
    "message": "The user has not set up their nutrition profile yet, so there are no targets. Suggest they set it up on the Diet page.",
}
_MAX_HISTORY_DAYS = 31
_MAX_PATTERN_DAYS = 90
_MAX_SEARCH_RESULTS = 8


def _day_from(arguments: dict, key: str = "date") -> date:
    """The day the model asked for, today when it left it out. Raises ValueError for text that is not a date.
    The chat prompt does not carry today's date, so a relative day ("yesterday") arrives as `days_ago`."""
    value = arguments.get(key)
    if value:
        return date.fromisoformat(str(value).strip()[:10])
    days_ago = arguments.get("days_ago")
    return today_ist() - timedelta(days=max(days_ago, 0)) if days_ago else today_ist()


def _targets(profile: DietProfileDBM) -> dict:
    return {
        "calories": profile.calorie_target,
        "protein_g": profile.protein_target_g,
        "carbs_g": profile.carbs_target_g,
        "fat_g": profile.fat_target_g,
        "fibre_g": profile.fibre_target_g,
        "water_ml": profile.water_target_ml,
    }


def _label(meal_type: str) -> str:
    return meal_type.replace("_", " ")


def _time(value) -> str | None:
    return value.strftime("%H:%M") if value else None


def _amount(quantity: float, unit: str) -> str:
    return f"{quantity:g} {unit}"


def get_diet_profile(context: ToolContext, arguments: dict) -> dict:
    profile = context.db.get(DietProfileDBM, context.current_user.id)
    if profile is None:
        return _NO_PROFILE
    return {
        "profile_set_up": True,
        "age": profile.age,
        "sex": profile.sex,
        "height_cm": profile.height_cm,
        "weight_kg": profile.weight_kg,
        "target_weight_kg": profile.target_weight_kg,
        "activity_level": profile.activity_level,
        "goal": profile.objective.replace("_", " "),
        "goal_note": profile.objective_note,
        "eating_style": profile.dietary_preference.replace("_", " "),
        "allergies": profile.allergies,
        "intolerances": profile.intolerances,
        "liked_foods": profile.liked_foods,
        "disliked_foods": profile.disliked_foods,
        "favourite_cuisines": profile.cuisines,
        "meals_per_day": profile.meals_per_day,
        "usual_meal_times": profile.meal_times,
        "cooking_time_available": profile.cooking_availability,
        "daily_food_budget": profile.daily_budget,
        "daily_targets": _targets(profile),
        "estimated_bmr": profile.bmr,
        "estimated_tdee": profile.tdee,
    }


def get_diet_day(context: ToolContext, arguments: dict) -> dict:
    from app.services import diet_diary_service  # prevent circular import

    try:
        day = _day_from(arguments)
    except ValueError:
        return {"error": "The date must look like 2026-11-02."}
    diary = diet_diary_service.get_day(context.db, context.current_user, day)
    profile = context.db.get(DietProfileDBM, context.current_user.id)
    result: dict = {
        "today": today_ist().isoformat(),
        "date": day.isoformat(),
        "weekday": day.strftime("%A"),
        "meals": [
            {
                "meal": _label(meal.meal_type),
                "time": _time(meal.eaten_at),
                "note": meal.note or None,
                "foods": [
                    {
                        "name": item.name,
                        "amount": _amount(item.quantity, item.unit),
                        "calories": item.calories,
                        "protein_g": item.protein_g,
                        "carbs_g": item.carbs_g,
                        "fat_g": item.fat_g,
                        "fibre_g": item.fibre_g,
                        "values_are_estimates": item.verification == "estimated" or item.quantity_certainty == "estimated",
                    }
                    for item in meal.items
                ],
                "meal_total": meal.totals.model_dump(),
            }
            for meal in diary.meals
        ],
        "day_total": diary.totals.model_dump(),
        "water_ml": diary.water_ml,
        "nothing_logged": not diary.meals,
    }
    if profile is not None:
        total = diary.totals
        result["targets"] = _targets(profile)
        result["remaining"] = {
            "calories": round(profile.calorie_target - total.calories, 1),
            "protein_g": round(profile.protein_target_g - total.protein_g, 1),
            "carbs_g": round(profile.carbs_target_g - total.carbs_g, 1),
            "fat_g": round(profile.fat_target_g - total.fat_g, 1),
            "fibre_g": round(profile.fibre_target_g - total.fibre_g, 1),
            "water_ml": profile.water_target_ml - diary.water_ml,
        }
        if diary.meals:
            from app.services import diet_overview_service  # prevent circular import

            score = diet_overview_service.get_overview(context.db, context.current_user, day).score
            result["habit_score"] = {"score": score.score, "out_of": 100, "parts": [f"{c.key}: {c.points}/{c.max_points}" for c in score.components]}
    return result


def get_diet_history(context: ToolContext, arguments: dict) -> dict:
    from app.services import diet_diary_service  # prevent circular import

    try:
        end = _day_from(arguments, "end_date")
    except ValueError:
        return {"error": "end_date must look like 2026-11-02."}
    days = min(max(arguments.get("days") or 7, 1), _MAX_HISTORY_DAYS)
    include_foods = bool(arguments.get("include_foods"))
    start = end - timedelta(days=days - 1)
    profile = context.db.get(DietProfileDBM, context.current_user.id)

    by_day: dict[date, list] = defaultdict(list)
    for log in diet_diary_service.logs_for(context.db, context.current_user, start, end):
        if log.items:
            by_day[log.log_date].append(log)
    water = dict(
        context.db.execute(
            select(WaterLogDBM.log_date, WaterLogDBM.amount_ml).where(
                WaterLogDBM.user_id == context.current_user.id, WaterLogDBM.log_date >= start, WaterLogDBM.log_date <= end
            )
        ).all()
    )

    rows = []
    for day in sorted(by_day):
        totals = diet_diary_service.totals_of([item for log in by_day[day] for item in log.items])
        row: dict = {
            "date": day.isoformat(),
            "weekday": day.strftime("%a"),
            "calories": totals.calories,
            "protein_g": totals.protein_g,
            "carbs_g": totals.carbs_g,
            "fat_g": totals.fat_g,
            "fibre_g": totals.fibre_g,
            "water_ml": water.get(day, 0),
            "meals_logged": len(by_day[day]),
        }
        if include_foods:
            row["meals"] = [
                {
                    "meal": _label(log.meal_type),
                    "time": _time(log.eaten_at),
                    "foods": [f"{item.name} ({_amount(item.quantity, item.unit)}, {round(item.calories)} kcal)" for item in log.items],
                }
                for log in by_day[day]
            ]
        rows.append(row)

    result: dict = {
        "today": today_ist().isoformat(),
        "from": start.isoformat(),
        "to": end.isoformat(),
        "days_in_range": days,
        "days_with_food_logged": len(rows),
        "days_with_nothing_logged": days - len(rows),
    }
    if rows:
        n = len(rows)
        result["average_per_logged_day"] = {
            key: round(sum(row[key] for row in rows) / n, 1) for key in ("calories", "protein_g", "carbs_g", "fat_g", "fibre_g")
        }
        result["average_water_ml_per_logged_day"] = round(sum(row["water_ml"] for row in rows) / n)
        if profile is not None:
            target = profile.calorie_target
            result["targets"] = _targets(profile)
            result["days_calories_within_10_percent_of_target"] = sum(1 for row in rows if abs(row["calories"] - target) <= target * 0.1)
            result["days_calories_over_target"] = sum(1 for row in rows if row["calories"] > target * 1.1)
            result["days_calories_under_target"] = sum(1 for row in rows if row["calories"] < target * 0.9)
            result["days_protein_target_met"] = sum(1 for row in rows if row["protein_g"] >= profile.protein_target_g * 0.95)
            result["days_fibre_target_met"] = sum(1 for row in rows if row["fibre_g"] >= profile.fibre_target_g * 0.95)
    result["days"] = rows
    result["note"] = "Days with nothing logged are left out: they mean nothing was recorded, not necessarily that nothing was eaten."
    return result


def get_eating_patterns(context: ToolContext, arguments: dict) -> dict:
    from app.services import diet_diary_service  # prevent circular import

    days = min(max(arguments.get("days") or 30, 7), _MAX_PATTERN_DAYS)
    end = today_ist()
    start = end - timedelta(days=days - 1)

    foods: Counter = Counter()
    food_kcal: Counter = Counter()
    meal_days: dict[str, set[date]] = defaultdict(set)
    meal_minutes: dict[str, list[int]] = defaultdict(list)
    day_kcal: dict[date, float] = defaultdict(float)
    for log in diet_diary_service.logs_for(context.db, context.current_user, start, end):
        if not log.items:
            continue
        meal_days[log.meal_type].add(log.log_date)
        if log.eaten_at:
            meal_minutes[log.meal_type].append(log.eaten_at.hour * 60 + log.eaten_at.minute)
        for item in log.items:
            foods[item.name] += 1
            food_kcal[item.name] += item.calories
            day_kcal[log.log_date] += item.calories

    if not day_kcal:
        return {"days_looked_at": days, "days_with_food_logged": 0, "message": "Nothing was logged in this period."}

    weekday_kcal: dict[str, list[float]] = defaultdict(list)
    for day, kcal in day_kcal.items():
        weekday_kcal[day.strftime("%A")].append(kcal)
    return {
        "days_looked_at": days,
        "days_with_food_logged": len(day_kcal),
        "most_eaten_foods": [
            {"food": name, "times_logged": count, "average_calories_each_time": round(food_kcal[name] / count)} for name, count in foods.most_common(15)
        ],
        "days_each_meal_was_logged": {_label(meal): len(logged) for meal, logged in sorted(meal_days.items(), key=lambda pair: -len(pair[1]))},
        "typical_time_by_meal": {
            _label(meal): f"{round(sum(minutes) / len(minutes)) // 60:02d}:{round(sum(minutes) / len(minutes)) % 60:02d}" for meal, minutes in meal_minutes.items()
        },
        "average_calories_by_weekday": {name: round(sum(values) / len(values)) for name, values in weekday_kcal.items()},
    }


def search_foods(context: ToolContext, arguments: dict) -> dict:
    from app.services import diet_calc_service, diet_food_service  # prevent circular import

    query = (arguments.get("query") or "").strip()
    if not query:
        return {"error": "Give a food name to look up."}
    limit = min(max(arguments.get("limit") or 5, 1), _MAX_SEARCH_RESULTS)
    profile = context.db.get(DietProfileDBM, context.current_user.id)
    hits = diet_food_service.search(context.db, context.current_user, query, limit=limit)
    foods = []
    for hit in hits:
        food = hit.food
        usual = diet_calc_service.scale_per_100g(
            diet_calc_service.Nutrients(food.calories, food.protein_g, food.carbs_g, food.fat_g, food.fibre_g),
            diet_calc_service.to_grams(food.default_quantity, food.default_unit, food.serving_grams),
        )
        row = {
            "food_id": food.id,
            "name": food.name,
            "category": food.category,
            "per_100g": {"calories": food.calories, "protein_g": food.protein_g, "carbs_g": food.carbs_g, "fat_g": food.fat_g, "fibre_g": food.fibre_g},
            "usual_serving": _amount(food.default_quantity, food.default_unit),
            "usual_serving_nutrition": {"calories": usual.calories, "protein_g": usual.protein_g, "carbs_g": usual.carbs_g, "fat_g": usual.fat_g, "fibre_g": usual.fibre_g},
        }
        library_food = diet_food_service.resolve_food(context.db, context.current_user, food.id)
        warnings = diet_food_service.restriction_warnings(profile, library_food) if library_food is not None else []
        if warnings:
            row["conflicts_with_the_users_profile"] = warnings
        foods.append(row)
    return {"foods": foods, "found": len(foods)}


async def suggest_next_meal(context: ToolContext, arguments: dict) -> dict:
    from app.core.exceptions import AppError  # prevent circular import
    from app.schemas.diet import MealCoachRequest
    from app.services import diet_coach_service

    if context.db.get(DietProfileDBM, context.current_user.id) is None:
        return _NO_PROFILE
    note = (arguments.get("note") or "").strip()[:200] or None
    try:
        request = MealCoachRequest(meal_type=arguments.get("meal_type") or None, note=note, exclude=[])
        response = await diet_coach_service.suggest(context.db, context.current_user, request)
    except (AppError, ValueError) as exc:
        return {"error": str(exc)}
    return {
        "meal": _label(response.meal_type),
        "aim_for": {"calories": response.budget.calories, "protein_g": response.budget.protein_g},
        "left_today": {"calories": response.remaining.calories, "protein_g": response.remaining.protein_g},
        "already_over_calorie_target": response.over_target,
        "notice": response.notice,
        "ideas": [
            {
                "title": idea.title,
                "why": idea.why,
                "foods": [f"{item.name}: {_amount(item.quantity, item.unit)}" for item in idea.items],
                "totals": idea.totals.model_dump(),
            }
            for idea in response.ideas
        ],
        "note_for_you": "These ideas already respect the user's allergies, eating style and dislikes. Present them in your own words; the user can add them from the Diet page.",
    }


class DietToolDefinitions(Enum):
    GET_DIET_PROFILE = {
        "type": "function",
        "function": {
            "name": "get_diet_profile",
            "description": (
                "Use this tool for the user's nutrition profile: age, weight, goal (lose, maintain or gain), eating style, allergies, "
                "intolerances, liked and disliked foods, favourite cuisines, usual meal times, cooking time, and the daily calorie, "
                "protein, carb, fat, fibre and water targets. Call it before any advice that depends on their goal, targets or restrictions."
            ),
            "strict": True,
            "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        },
    }
    GET_DIET_DAY = {
        "type": "function",
        "function": {
            "name": "get_diet_day",
            "description": (
                "Use this tool to see everything the user logged on one day: each meal with its time and foods (amounts, calories, "
                "protein, carbs, fat, fibre), the day's totals, water, the targets, what is still remaining, and the habit score. "
                "Use it for questions about today ('what's left', 'how am I doing') or about a specific day ('what did I eat on Friday'). "
                "Do not rely on conversation memory: the diary changes outside the conversation."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": ["string", "null"],
                        "description": "The day as YYYY-MM-DD when the user gave a calendar date. Otherwise null.",
                    },
                    "days_ago": {
                        "type": ["integer", "null"],
                        "minimum": 0,
                        "description": (
                            "How many days before today: 0 for today, 1 for yesterday, 2 for the day before. Use it when the user said "
                            "a relative day, and null when you gave a date. Use null for both to get today. If the user names a weekday "
                            "('last Monday'), call get_diet_history first: it lists each day with its date and weekday."
                        ),
                    },
                },
                "required": ["date", "days_ago"],
                "additionalProperties": False,
            },
        },
    }
    GET_DIET_HISTORY = {
        "type": "function",
        "function": {
            "name": "get_diet_history",
            "description": (
                "Use this tool to look back over several days: calories and macros for each logged day, averages, and how many days "
                "hit or missed the calorie, protein and fibre targets. Use it for trends and questions like 'how was my week', "
                "'am I eating enough protein' or 'what did I eat this month'. Days with nothing logged are left out of the list."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": _MAX_HISTORY_DAYS,
                        "description": "How many days to look at, ending on end_date (at most 31). Use null for the last 7 days.",
                    },
                    "end_date": {
                        "type": ["string", "null"],
                        "description": "The last day to include as YYYY-MM-DD. Use null for today. The result says what today's date is.",
                    },
                    "include_foods": {
                        "type": "boolean",
                        "description": (
                            "True to list the foods eaten at every meal of every day (use it when the user asks what they ate, and keep the "
                            "range short). False for trends and totals only, which is much smaller."
                        ),
                    },
                },
                "required": ["days", "end_date", "include_foods"],
                "additionalProperties": False,
            },
        },
    }
    GET_EATING_PATTERNS = {
        "type": "function",
        "function": {
            "name": "get_eating_patterns",
            "description": (
                "Use this tool to learn the user's habits: the foods they log most often, how often each meal is logged, the usual "
                "time of each meal, and average calories on each weekday. Use it for questions like 'what do I usually eat', "
                "'do I skip breakfast', 'which days do I overeat' or when personalising advice."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": ["integer", "null"],
                        "minimum": 7,
                        "maximum": _MAX_PATTERN_DAYS,
                        "description": "How many days back to look, ending today (7 to 90). Use null for 30.",
                    },
                },
                "required": ["days"],
                "additionalProperties": False,
            },
        },
    }
    SEARCH_FOODS = {
        "type": "function",
        "function": {
            "name": "search_foods",
            "description": (
                "Use this tool to look up a food in the nutrition library for its calories, protein, carbs, fat and fibre per 100 g and "
                "for a usual serving. It also says whether the food conflicts with the user's allergies, eating style or dislikes. "
                "Use it instead of guessing nutrition values from memory."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The food to look up, for example 'paneer tikka' or 'oats'."},
                    "limit": {
                        "type": ["integer", "null"],
                        "minimum": 1,
                        "maximum": _MAX_SEARCH_RESULTS,
                        "description": "How many matches to return (at most 8). Use null for 5.",
                    },
                },
                "required": ["query", "limit"],
                "additionalProperties": False,
            },
        },
    }
    SUGGEST_NEXT_MEAL = {
        "type": "function",
        "function": {
            "name": "suggest_next_meal",
            "description": (
                "Use this tool when the user asks what to eat next or wants meal ideas. It builds three meals from the food library that fit "
                "what is left of today's calories and protein, the user's allergies, eating style, dislikes and usual foods, with amounts "
                "and nutrition already worked out. Prefer it to inventing meals yourself."
            ),
            "strict": True,
            "parameters": {
                "type": "object",
                "properties": {
                    "meal_type": {
                        "type": ["string", "null"],
                        "enum": ["breakfast", "morning_snack", "lunch", "evening_snack", "dinner", None],
                        "description": "The meal to plan. Use null to plan the user's next meal automatically.",
                    },
                    "note": {
                        "type": ["string", "null"],
                        "description": "Anything the user asked for, for example 'something light' or 'I have paneer at home'. Use null if they said nothing.",
                    },
                },
                "required": ["meal_type", "note"],
                "additionalProperties": False,
            },
        },
    }


DIET_TOOL_DEFINITIONS: list[dict] = [t.value for t in DietToolDefinitions]


class DietToolsEnum(StrEnum):
    GET_DIET_PROFILE = "get_diet_profile"
    GET_DIET_DAY = "get_diet_day"
    GET_DIET_HISTORY = "get_diet_history"
    GET_EATING_PATTERNS = "get_eating_patterns"
    SEARCH_FOODS = "search_foods"
    SUGGEST_NEXT_MEAL = "suggest_next_meal"


DIET_TOOLS: dict[str, Callable] = {
    DietToolsEnum.GET_DIET_PROFILE: get_diet_profile,
    DietToolsEnum.GET_DIET_DAY: get_diet_day,
    DietToolsEnum.GET_DIET_HISTORY: get_diet_history,
    DietToolsEnum.GET_EATING_PATTERNS: get_eating_patterns,
    DietToolsEnum.SEARCH_FOODS: search_foods,
    DietToolsEnum.SUGGEST_NEXT_MEAL: suggest_next_meal,
}
