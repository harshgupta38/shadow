"""Nutrition profile and daily targets. Estimates come from diet_calc_service; targets the user (or their dietitian) set are kept."""

from sqlalchemy.orm import Session

from app.models.diet import DietProfileDBM
from app.models.user import UserDBM
from app.schemas.diet import (
    EstimateRequest,
    EstimateResponse,
    ProfileResponse,
    ProfileSaveRequest,
    ProfileStateResponse,
    TargetValues,
)
from app.services import diet_calc_service

# request/response field -> (profile column, estimate attribute)
_TARGETS = {
    "calorie_target": "calories",
    "protein_target_g": "protein_g",
    "carbs_target_g": "carbs_g",
    "fat_target_g": "fat_g",
    "fibre_target_g": "fibre_g",
    "water_target_ml": "water_ml",
}


def get_profile_row(db: Session, user: UserDBM) -> DietProfileDBM | None:
    return db.get(DietProfileDBM, user.id)


def _warnings(row: DietProfileDBM) -> list[str]:
    """Cautions about a calorie target someone chose themselves. A prescribed target is theirs to follow, so it is not second-guessed."""
    if row.target_sources.get("calorie_target") != "user":
        return []
    return diet_calc_service.validate_custom_calories(row.calorie_target, sex=row.sex, tdee=row.tdee)


def _to_response(row: DietProfileDBM, notes: list[str] | None = None) -> ProfileResponse:
    response = ProfileResponse.model_validate(row)
    response.notes = notes or []
    response.warnings = _warnings(row)
    return response


def get_state(db: Session, user: UserDBM) -> ProfileStateResponse:
    row = get_profile_row(db, user)
    if row is None:
        return ProfileStateResponse(onboarded=False)
    return ProfileStateResponse(onboarded=True, profile=_to_response(row))


def estimate(request: EstimateRequest) -> EstimateResponse:
    """A preview for the onboarding screen. Nothing is saved."""
    result = diet_calc_service.estimate_targets(
        sex=request.sex,
        age=request.age,
        height_cm=request.height_cm,
        weight_kg=request.weight_kg,
        activity_level=request.activity_level,
        objective=request.objective,
    )
    return EstimateResponse(
        bmr=result.bmr,
        tdee=result.tdee,
        targets=TargetValues(
            calorie_target=result.calories,
            protein_target_g=result.protein_g,
            carbs_target_g=result.carbs_g,
            fat_target_g=result.fat_g,
            fibre_target_g=result.fibre_g,
            water_target_ml=result.water_ml,
        ),
        notes=list(result.notes),
    )


def save_profile(db: Session, user: UserDBM, request: ProfileSaveRequest) -> ProfileResponse:
    row = get_profile_row(db, user)
    overrides = request.targets.model_dump(exclude={"prescribed"}, exclude_none=True) if request.targets else {}
    prescribed = bool(request.targets and request.targets.prescribed)

    kept = {
        key
        for key, source in (row.target_sources.items() if row else [])
        if source in ("user", "prescribed") and not request.recalculate_targets
    }
    estimated = None
    if any(key not in overrides and key not in kept for key in _TARGETS):
        estimated = diet_calc_service.estimate_targets(
            sex=request.sex or "",
            age=request.age,
            height_cm=request.height_cm,
            weight_kg=request.weight_kg,
            activity_level=request.activity_level,
            objective=request.objective,
        )

    previous_values = {key: getattr(row, key) for key in _TARGETS} if row else {}
    values: dict[str, int] = {}
    sources: dict[str, str] = {}
    for key, estimate_attr in _TARGETS.items():
        if key in overrides:
            values[key], sources[key] = overrides[key], "prescribed" if prescribed else "user"
        elif key in kept:
            values[key], sources[key] = previous_values[key], row.target_sources[key]  # never overwritten without approval
        else:
            assert estimated is not None
            values[key], sources[key] = getattr(estimated, estimate_attr), "estimated"

    extra_notes: list[str] = []
    if estimated is not None and sources["calorie_target"] != "estimated":
        # Macros still on estimates must add up to the calories the user chose, not to the estimate's calories.
        ratio = values["calorie_target"] / estimated.calories
        scaled = [key for key in ("protein_target_g", "carbs_target_g", "fat_target_g") if sources[key] == "estimated"]
        for key in scaled:
            values[key] = max(1, round(values[key] * ratio))
        if scaled:
            extra_notes.append("Protein, carbohydrate and fat targets were scaled to match your calorie target.")

    if row is None:
        row = DietProfileDBM(user_id=user.id)
        db.add(row)
    for field in (
        "age", "sex", "height_cm", "weight_kg", "target_weight_kg", "activity_level", "objective", "objective_note",
        "dietary_preference", "allergies", "intolerances", "liked_foods", "disliked_foods", "cuisines", "meals_per_day",
        "meal_times", "cooking_availability", "daily_budget",
    ):
        setattr(row, field, getattr(request, field))
    for key, value in values.items():
        setattr(row, key, value)
    row.target_sources = sources
    if estimated is not None:
        row.bmr, row.tdee = estimated.bmr, estimated.tdee
    elif request.sex:
        bmr = diet_calc_service.calc_bmr(sex=request.sex, weight_kg=request.weight_kg, height_cm=request.height_cm, age=request.age)
        row.bmr, row.tdee = bmr, diet_calc_service.calc_tdee(bmr, request.activity_level)
    db.commit()
    db.refresh(row)
    return _to_response(row, [*(estimated.notes if estimated else ()), *extra_notes])
