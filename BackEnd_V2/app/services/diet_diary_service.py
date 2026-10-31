"""The food diary: meals and the foods eaten in them. Only what is saved here counts as eaten.

Totals are always computed from the items on read, so editing or deleting an old entry can never leave a stale total.
Each item keeps a snapshot of its nutrients from the moment it was logged.
"""

from datetime import date, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.timezone import today_ist
from app.core.exceptions import NotFoundError, ValidationError
from app.models.diet import STANDARD_MEAL_TYPES, DietProfileDBM, FoodDBM, FoodLogDBM, FoodLogItemDBM, SavedMealDBM, WaterLogDBM
from app.models.user import UserDBM
from app.schemas.diet import (
    CopyMealsRequest,
    CopyMealsResponse,
    DiaryAddRequest,
    DiaryDayResponse,
    DiaryItemMoveRequest,
    DiaryItemResponse,
    DiaryItemUpdateRequest,
    DiaryMealResponse,
    DiaryMealUpdateRequest,
    LogItemRequest,
    NutrientTotals,
    SavedMealCreateRequest,
    SavedMealLogRequest,
    SavedMealResponse,
)
from app.services import diet_calc_service, diet_food_service
from app.services.diet_calc_service import Nutrients

_MAX_MEAL_TYPE_LEN = 40


def resolve_date(value: date | None) -> date:
    """Defaults to today (IST). Food can only be logged for today or the past: future meals belong in the planner."""
    day = value or today_ist()
    if day > today_ist():
        raise ValidationError("You can't log food for a future day.", errors={"log_date": "Use the meal planner for future meals."})
    return day


def _meal_sort_key(log: FoodLogDBM) -> tuple[int, str, int]:
    rank = STANDARD_MEAL_TYPES.index(log.meal_type) if log.meal_type in STANDARD_MEAL_TYPES else len(STANDARD_MEAL_TYPES)
    return rank, log.eaten_at.isoformat() if log.eaten_at else "99", log.id


def totals_of(items: list[FoodLogItemDBM]) -> Nutrients:
    return diet_calc_service.sum_nutrients(
        [Nutrients(i.calories, i.protein_g, i.carbs_g, i.fat_g, i.fibre_g) for i in items]
    )


def _totals_model(total: Nutrients) -> NutrientTotals:
    return NutrientTotals(
        calories=total.calories, protein_g=total.protein_g, carbs_g=total.carbs_g, fat_g=total.fat_g, fibre_g=total.fibre_g
    )


def meal_response(log: FoodLogDBM) -> DiaryMealResponse:
    return DiaryMealResponse(
        id=log.id,
        meal_type=log.meal_type,
        eaten_at=log.eaten_at,
        note=log.note,
        items=[DiaryItemResponse.model_validate(i) for i in log.items],
        totals=_totals_model(totals_of(log.items)),
    )


# ---------- reading ----------


def logs_for(db: Session, user: UserDBM, start: date, end: date | None = None) -> list[FoodLogDBM]:
    stmt = select(FoodLogDBM).where(FoodLogDBM.user_id == user.id, FoodLogDBM.log_date >= start, FoodLogDBM.log_date <= (end or start))
    return sorted(db.scalars(stmt).all(), key=lambda log: (log.log_date, *_meal_sort_key(log)))


def water_total(db: Session, user: UserDBM, day: date) -> int:
    return sum(db.scalars(select(WaterLogDBM.amount_ml).where(WaterLogDBM.user_id == user.id, WaterLogDBM.log_date == day)).all())


def get_day(db: Session, user: UserDBM, day: date | None = None) -> DiaryDayResponse:
    target = day or today_ist()
    logs = logs_for(db, user, target)
    items = [item for log in logs for item in log.items]
    return DiaryDayResponse(
        date=target,
        meals=[meal_response(log) for log in logs],
        totals=_totals_model(totals_of(items)),
        water_ml=water_total(db, user, target),
        has_estimated_items=any(i.verification == "estimated" or i.quantity_certainty == "estimated" for i in items),  # values the user entered are theirs, not estimates
    )


def _own_log(db: Session, user: UserDBM, log_id: int) -> FoodLogDBM:
    log = db.scalar(select(FoodLogDBM).where(FoodLogDBM.id == log_id, FoodLogDBM.user_id == user.id))
    if log is None:
        raise NotFoundError("Meal not found.")
    return log


def _own_item(db: Session, user: UserDBM, item_id: int) -> FoodLogItemDBM:
    item = db.scalar(
        select(FoodLogItemDBM)
        .join(FoodLogDBM, FoodLogDBM.id == FoodLogItemDBM.log_id)
        .where(FoodLogItemDBM.id == item_id, FoodLogDBM.user_id == user.id)
    )
    if item is None:
        raise NotFoundError("Food entry not found.")
    return item


def restriction_notices(db: Session, user: UserDBM, foods: list[FoodDBM]) -> list[str]:
    """Allergy, intolerance and diet-preference conflicts for foods that were just logged. Logging is never blocked: the user ate it."""
    profile = db.get(DietProfileDBM, user.id)
    notices: list[str] = []
    for food in foods:
        for warning in diet_food_service.restriction_warnings(profile, food):
            if warning not in notices:
                notices.append(warning)
    return notices


# ---------- writing ----------


def _validate_meal_type(meal_type: str) -> str:
    cleaned = meal_type.strip().lower().replace(" ", "_")
    if not cleaned or len(cleaned) > _MAX_MEAL_TYPE_LEN:
        raise ValidationError("Choose a meal name up to 40 characters.", errors={"meal_type": "Invalid meal name."})
    return cleaned


def get_or_create_log(db: Session, user: UserDBM, day: date, meal_type: str, eaten_at: time | None = None) -> FoodLogDBM:
    meal_type = _validate_meal_type(meal_type)

    def find() -> FoodLogDBM | None:
        return db.scalar(
            select(FoodLogDBM).where(FoodLogDBM.user_id == user.id, FoodLogDBM.log_date == day, FoodLogDBM.meal_type == meal_type)
        )

    log = find()
    if log is None:
        log = FoodLogDBM(user_id=user.id, log_date=day, meal_type=meal_type, eaten_at=eaten_at)
        db.add(log)
        try:
            db.flush()
        except IntegrityError:  # two requests created the same meal at once; use the one that won
            db.rollback()
            log = find()
            if log is None:
                raise
    elif eaten_at is not None:
        log.eaten_at = eaten_at
    return log


def build_item(food: FoodDBM, request: LogItemRequest | None = None, *, quantity: float | None = None, unit: str | None = None,
               certainty: str | None = None, token: str | None = None) -> FoodLogItemDBM:
    """A log item holding a copy of the food's nutrients for this quantity."""
    qty = request.quantity if request else quantity
    unit_name = request.unit if request else unit
    assert qty is not None and unit_name is not None
    grams, nutrients = diet_food_service.nutrients_for(food, qty, unit_name)
    return FoodLogItemDBM(
        food_id=food.id,
        name=food.name,
        quantity=qty,
        unit=unit_name.strip().lower(),
        grams=grams,
        calories=nutrients.calories,
        protein_g=nutrients.protein_g,
        carbs_g=nutrients.carbs_g,
        fat_g=nutrients.fat_g,
        fibre_g=nutrients.fibre_g,
        nutrition_source=food.source,
        verification=food.verification,
        quantity_certainty=(request.certainty if request else certainty) or diet_calc_service.certainty_for_unit(unit_name),
        client_token=(request.client_token if request else token),
    )


def _append(log: FoodLogDBM, item: FoodLogItemDBM) -> None:
    item.position = len(log.items)
    log.items.append(item)


def add_items(db: Session, user: UserDBM, request: DiaryAddRequest) -> DiaryMealResponse:
    day = resolve_date(request.log_date)
    foods = {i.food_id: diet_food_service.get_food(db, user, i.food_id) for i in request.items}
    prepared = [(item, build_item(foods[item.food_id], item)) for item in request.items]  # every unit is checked before anything is written

    log = get_or_create_log(db, user, day, request.meal_type, request.eaten_at)
    meal_type = log.meal_type
    seen_tokens = {i.client_token for i in log.items if i.client_token}
    for source, item in prepared:
        if source.client_token and source.client_token in seen_tokens:
            continue  # this submit already went through
        if source.client_token:
            seen_tokens.add(source.client_token)
        _append(log, item)
    try:
        db.commit()
    except IntegrityError:
        # The same submit arrived twice at once and the other request saved it first: return that result, not an error.
        db.rollback()
        log = db.scalar(select(FoodLogDBM).where(FoodLogDBM.user_id == user.id, FoodLogDBM.log_date == day, FoodLogDBM.meal_type == meal_type))
        if log is None:
            raise
    db.refresh(log)
    response = meal_response(log)
    response.notices = restriction_notices(db, user, list(foods.values()))
    return response


def update_item(db: Session, user: UserDBM, item_id: int, request: DiaryItemUpdateRequest) -> DiaryMealResponse:
    """Changes a quantity or unit. The nutrients are rescaled from what was logged, not re-read from the food, so history stays put."""
    item = _own_item(db, user, item_id)
    quantity = request.quantity if request.quantity is not None else item.quantity
    unit = (request.unit or item.unit).strip().lower()
    servings: dict[str, float] = {item.unit: item.grams / item.quantity}
    if item.food_id:
        food = diet_food_service.resolve_food(db, user, item.food_id)
        if food is not None:
            servings.update(food.serving_grams)
    grams = diet_calc_service.to_grams(quantity, unit, servings)
    factor = grams / item.grams
    item.calories = diet_calc_service.round1(item.calories * factor)
    item.protein_g = diet_calc_service.round1(item.protein_g * factor)
    item.carbs_g = diet_calc_service.round1(item.carbs_g * factor)
    item.fat_g = diet_calc_service.round1(item.fat_g * factor)
    item.fibre_g = diet_calc_service.round1(item.fibre_g * factor)
    item.quantity, item.unit, item.grams = quantity, unit, grams
    if request.certainty:
        item.quantity_certainty = request.certainty
    elif request.unit:
        item.quantity_certainty = diet_calc_service.certainty_for_unit(unit)  # a bowl is a rough amount, grams are exact
    db.commit()
    db.refresh(item.log)
    return meal_response(item.log)


def delete_item(db: Session, user: UserDBM, item_id: int) -> None:
    item = _own_item(db, user, item_id)
    log = item.log
    log.items.remove(item)
    if not log.items:
        db.delete(log)  # an empty meal would only clutter the diary
    db.commit()


def _clone(item: FoodLogItemDBM) -> FoodLogItemDBM:
    return FoodLogItemDBM(
        food_id=item.food_id, name=item.name, quantity=item.quantity, unit=item.unit, grams=item.grams,
        calories=item.calories, protein_g=item.protein_g, carbs_g=item.carbs_g, fat_g=item.fat_g, fibre_g=item.fibre_g,
        nutrition_source=item.nutrition_source, verification=item.verification, quantity_certainty=item.quantity_certainty,
    )


def move_item(db: Session, user: UserDBM, item_id: int, request: DiaryItemMoveRequest) -> DiaryMealResponse:
    item = _own_item(db, user, item_id)
    source = item.log
    target = get_or_create_log(db, user, resolve_date(request.log_date) if request.log_date else source.log_date, request.meal_type)
    if target.id == source.id:
        return meal_response(source)
    source.items.remove(item)
    item.client_token = None
    _append(target, item)
    if not source.items:
        db.delete(source)
    db.commit()
    db.refresh(target)
    return meal_response(target)


def duplicate_item(db: Session, user: UserDBM, item_id: int, request: DiaryItemMoveRequest | None = None) -> DiaryMealResponse:
    item = _own_item(db, user, item_id)
    target = item.log if request is None else get_or_create_log(db, user, resolve_date(request.log_date) if request.log_date else item.log.log_date, request.meal_type)
    _append(target, _clone(item))
    db.commit()
    db.refresh(target)
    return meal_response(target)


def update_meal(db: Session, user: UserDBM, log_id: int, request: DiaryMealUpdateRequest) -> DiaryMealResponse:
    log = _own_log(db, user, log_id)
    fields = request.model_fields_set
    if "eaten_at" in fields:
        log.eaten_at = request.eaten_at
    if "note" in fields and request.note is not None:
        log.note = request.note
    db.commit()
    db.refresh(log)
    return meal_response(log)


def delete_meal(db: Session, user: UserDBM, log_id: int) -> None:
    db.delete(_own_log(db, user, log_id))
    db.commit()


def copy_meals(db: Session, user: UserDBM, request: CopyMealsRequest) -> CopyMealsResponse:
    """Copies meals from an earlier day. A meal the target day already has is skipped, never doubled."""
    target_day = resolve_date(request.to_date)
    wanted = {_validate_meal_type(m) for m in request.meal_types} if request.meal_types is not None else None
    sources = [log for log in logs_for(db, user, request.from_date) if wanted is None or log.meal_type in wanted]
    if not sources:
        raise NotFoundError("There is nothing logged on that day to copy.")
    if request.from_date == target_day:
        raise ValidationError("Choose a different day to copy from.", errors={"from_date": "This is the same day."})

    copied: list[str] = []
    skipped: list[str] = []
    for source in sources:
        existing = db.scalar(
            select(FoodLogDBM).where(FoodLogDBM.user_id == user.id, FoodLogDBM.log_date == target_day, FoodLogDBM.meal_type == source.meal_type)
        )
        if existing is not None and existing.items:
            skipped.append(source.meal_type)
            continue
        target = get_or_create_log(db, user, target_day, source.meal_type, source.eaten_at)
        for item in source.items:
            _append(target, _clone(item))
        copied.append(source.meal_type)
    db.commit()
    return CopyMealsResponse(copied_meals=copied, skipped_meals=skipped, day=get_day(db, user, target_day))


# ---------- saved meals ----------


def list_saved_meals(db: Session, user: UserDBM) -> list[SavedMealResponse]:
    rows = db.scalars(select(SavedMealDBM).where(SavedMealDBM.user_id == user.id).order_by(SavedMealDBM.name)).all()
    return [SavedMealResponse.model_validate(r) for r in rows]


def create_saved_meal(db: Session, user: UserDBM, request: SavedMealCreateRequest) -> SavedMealResponse:
    meal_type = _validate_meal_type(request.meal_type)
    log = db.scalar(
        select(FoodLogDBM).where(FoodLogDBM.user_id == user.id, FoodLogDBM.log_date == request.log_date, FoodLogDBM.meal_type == meal_type)
    )
    if log is None or not log.items:
        raise NotFoundError("That meal has no food to save.")
    if db.scalar(select(SavedMealDBM.id).where(SavedMealDBM.user_id == user.id, SavedMealDBM.name == request.name)):
        raise ValidationError("You already saved a meal with this name.", errors={"name": "Choose another name."})
    saved = SavedMealDBM(
        user_id=user.id,
        name=request.name,
        meal_type=meal_type,
        items=[
            {"food_id": i.food_id, "name": i.name, "quantity": i.quantity, "unit": i.unit, "certainty": i.quantity_certainty}
            for i in log.items
            if i.food_id
        ],
    )
    if not saved.items:
        raise ValidationError("These foods can't be saved because they are no longer in the food library.")
    db.add(saved)
    try:
        db.commit()
    except IntegrityError as exc:  # two saves with the same name at once
        db.rollback()
        raise ValidationError("You already saved a meal with this name.", errors={"name": "Choose another name."}) from exc
    db.refresh(saved)
    return SavedMealResponse.model_validate(saved)


def delete_saved_meal(db: Session, user: UserDBM, saved_id: int) -> None:
    saved = db.scalar(select(SavedMealDBM).where(SavedMealDBM.id == saved_id, SavedMealDBM.user_id == user.id))
    if saved is None:
        raise NotFoundError("Saved meal not found.")
    db.delete(saved)
    db.commit()


def log_saved_meal(db: Session, user: UserDBM, saved_id: int, request: SavedMealLogRequest) -> DiaryMealResponse:
    saved = db.scalar(select(SavedMealDBM).where(SavedMealDBM.id == saved_id, SavedMealDBM.user_id == user.id))
    if saved is None:
        raise NotFoundError("Saved meal not found.")
    items: list[FoodLogItemDBM] = []
    used: list[FoodDBM] = []
    left_out: list[str] = []
    for entry in saved.items:
        food = diet_food_service.resolve_food(db, user, entry["food_id"])  # the user's own edits apply
        if food is None:  # a food removed since saving is left out rather than guessed, and the user is told
            left_out.append(entry["name"])
            continue
        items.append(build_item(food, quantity=entry["quantity"], unit=entry["unit"], certainty=entry.get("certainty")))
        used.append(food)
    if not items:
        raise ValidationError("The foods in this saved meal are no longer available.")
    meal_type = request.meal_type or saved.meal_type or "lunch"
    log = get_or_create_log(db, user, resolve_date(request.log_date), meal_type, request.eaten_at)
    for item in items:
        _append(log, item)
    db.commit()
    db.refresh(log)
    response = meal_response(log)
    response.notices = restriction_notices(db, user, used)
    if left_out:
        response.notices.append(f"Left out because they are no longer available: {', '.join(left_out)}. Your total for this meal is lower as a result.")
    return response
