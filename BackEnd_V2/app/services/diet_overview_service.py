"""The daily nutrition dashboard: consumed versus target, per-meal totals, water and the explainable score."""

from datetime import date

from sqlalchemy.orm import Session

from app.common.timezone import today_ist
from app.core.exceptions import NotFoundError
from app.models.diet import DietProfileDBM
from app.models.user import UserDBM
from app.schemas.diet import (
    MacroProgress,
    MealSummary,
    NutritionScoreResponse,
    OverviewResponse,
    ScoreComponentResponse,
)
from app.services import diet_calc_service, diet_diary_service

SCORE_EXPLANATION = (
    "A simple habit score out of 100: calories within 10% of target (35), protein (25), fibre (15), variety of foods (10) "
    "and water (15). It rewards consistency and is not a medical or dietary assessment. A day with no food logged has no score."
)


def _progress(consumed: float, target: float) -> MacroProgress:
    percent = round(consumed / target * 100, 1) if target > 0 else 0.0
    return MacroProgress(consumed=round(consumed, 1), target=target, percent=percent)


def get_overview(db: Session, user: UserDBM, day: date | None = None) -> OverviewResponse:
    profile = db.get(DietProfileDBM, user.id)
    if profile is None:
        raise NotFoundError("Set up your nutrition profile first.")
    target_day = day or today_ist()
    logs = diet_diary_service.logs_for(db, user, target_day)
    items = [item for log in logs for item in log.items]
    total = diet_diary_service.totals_of(items)
    water_ml = diet_diary_service.water_total(db, user, target_day)

    score, components = diet_calc_service.daily_score(
        total=total,
        calorie_target=profile.calorie_target,
        protein_target=profile.protein_target_g,
        fibre_target=profile.fibre_target_g,
        distinct_foods=len({(i.food_id or i.name) for i in items}),
        water_ml=water_ml,
        water_target_ml=profile.water_target_ml,
        has_logged_food=bool(items),
    )
    return OverviewResponse(
        date=target_day,
        calories=_progress(total.calories, profile.calorie_target),
        remaining_calories=round(profile.calorie_target - total.calories, 1),
        protein=_progress(total.protein_g, profile.protein_target_g),
        carbs=_progress(total.carbs_g, profile.carbs_target_g),
        fat=_progress(total.fat_g, profile.fat_target_g),
        fibre=_progress(total.fibre_g, profile.fibre_target_g),
        meals=[
            MealSummary(
                meal_type=log.meal_type,
                eaten_at=log.eaten_at,
                item_count=len(log.items),
                totals=diet_diary_service.meal_response(log).totals,
            )
            for log in logs
        ],
        water=_progress(water_ml, profile.water_target_ml),
        score=NutritionScoreResponse(
            score=score,
            components=[ScoreComponentResponse(key=c.key, points=c.points, max_points=c.max_points, explanation=c.explanation) for c in components],
            explanation=SCORE_EXPLANATION,
        ),
        has_estimated_items=any(i.verification == "estimated" or i.quantity_certainty == "estimated" for i in items),
    )
