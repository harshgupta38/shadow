"""The food library: search, custom foods, favourites and the quick lists, plus the maths that turns a quantity into nutrients."""

import difflib
import re
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common.timezone import today_ist
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.models.diet import DietProfileDBM, FoodDBM, FoodFavouriteDBM, FoodLogDBM, FoodLogItemDBM, FoodOverrideDBM
from app.models.user import UserDBM
from app.schemas.diet import FoodCustomRequest, FoodDefaults, FoodResponse, FoodSearchHit, FoodValuesRequest, QuickFoodsResponse
from app.services import diet_calc_service, diet_seed_service
from app.services.diet_calc_service import Nutrients

_WORD = re.compile(r"[a-z0-9]+")
_MATCH_RANK = {"exact": 0, "prefix": 1, "contains": 2, "similar": 3}

# What a person writes in "allergies" -> the tags a food carries. Tags are best effort: mixed dishes can hide ingredients.
_ALLERGY_TAGS = {
    "milk": {"dairy"}, "dairy": {"dairy"}, "lactose": {"dairy"}, "cheese": {"dairy"}, "curd": {"dairy"},
    "wheat": {"gluten"}, "gluten": {"gluten"},
    "nut": {"nuts", "peanut"}, "nuts": {"nuts", "peanut"}, "tree nut": {"nuts"}, "tree nuts": {"nuts"},
    "peanut": {"peanut"}, "peanuts": {"peanut"},
    "egg": {"egg"}, "eggs": {"egg"},
    "fish": {"fish"}, "shellfish": {"shellfish"}, "prawn": {"shellfish"}, "prawns": {"shellfish"}, "shrimp": {"shellfish"},
    "soy": {"soy"}, "soya": {"soy"},
}
_DIET_EXCLUDES = {
    "vegetarian": {"non_vegetarian", "egg"},
    "eggetarian": {"non_vegetarian"},
    "vegan": {"non_vegetarian", "egg", "vegetarian"},
    "jain": {"non_vegetarian", "egg", "root_vegetable"},  # onion, potato, carrot and the like
}


_FILLER_WORDS = {"allergy", "allergic", "intolerance", "intolerant", "to", "free", "no", "sensitivity", "sensitive"}


def visible_to(user: UserDBM):
    """Library foods plus this user's own. Another user's custom foods are never visible."""
    return or_(FoodDBM.user_id.is_(None), FoodDBM.user_id == user.id)


def overlays_for(db: Session, user: UserDBM) -> dict[int, FoodOverrideDBM]:
    return {o.food_id: o for o in db.scalars(select(FoodOverrideDBM).where(FoodOverrideDBM.user_id == user.id)).all()}


def apply_overlay(food: FoodDBM, overlay: FoodOverrideDBM | None) -> FoodDBM:
    """The food as this user sees it. With an override this is a detached copy carrying the user's values, never the shared
    row, so nothing here can be saved back by accident. Every read path goes through this: search, logging, parsing, saved meals."""
    if overlay is None:
        return food
    values = {column.key: getattr(food, column.key) for column in FoodDBM.__table__.columns}
    servings = dict(overlay.serving_grams)
    default_unit, default_quantity = food.default_unit, food.default_quantity
    if default_unit != "g" and default_unit not in servings:  # the user removed the serving this food is usually measured in
        default_unit, default_quantity = (next(iter(servings)), 1.0) if servings else ("g", 100.0)
    values.update(
        calories=overlay.calories, protein_g=overlay.protein_g, carbs_g=overlay.carbs_g, fat_g=overlay.fat_g, fibre_g=overlay.fibre_g,
        serving_grams=servings, default_unit=default_unit, default_quantity=default_quantity,
        source="Your edited values", verification="user", confidence=1.0,
    )
    effective = FoodDBM(**values)
    effective._override = overlay  # type: ignore[attr-defined]
    effective._original = food  # type: ignore[attr-defined]
    return effective


def resolve_food(db: Session, user: UserDBM, food_id: int) -> FoodDBM | None:
    """The food as this user sees it (their edits applied), or None when it doesn't exist or isn't theirs to see."""
    food = db.scalar(select(FoodDBM).where(FoodDBM.id == food_id, visible_to(user)))
    if food is None:
        return None
    overlay = db.scalar(select(FoodOverrideDBM).where(FoodOverrideDBM.user_id == user.id, FoodOverrideDBM.food_id == food_id))
    return apply_overlay(food, overlay)


def get_food(db: Session, user: UserDBM, food_id: int) -> FoodDBM:
    food = resolve_food(db, user, food_id)
    if food is None:
        raise NotFoundError("Food not found.")
    return food


def favourite_ids(db: Session, user: UserDBM) -> set[int]:
    return set(db.scalars(select(FoodFavouriteDBM.food_id).where(FoodFavouriteDBM.user_id == user.id)).all())


def to_response(food: FoodDBM, user: UserDBM, favourites: set[int]) -> FoodResponse:
    response = FoodResponse.model_validate(food)
    response.is_custom = food.user_id == user.id
    response.is_favourite = food.id in favourites
    original: FoodDBM | None = getattr(food, "_original", None)
    if original is not None:
        response.is_edited = True
        response.defaults = FoodDefaults(
            calories=original.calories, protein_g=original.protein_g, carbs_g=original.carbs_g, fat_g=original.fat_g,
            fibre_g=original.fibre_g, serving_grams=dict(original.serving_grams),
        )
    return response


# ---------- search ----------


def _closeness(text: str, food: FoodDBM) -> float:
    """How close a query is to a food's names, as a whole name or any single word (0 to 1). Alternate names count a little
    less than the food's own name, so "soya paneer" on tofu never outranks Paneer itself."""
    best = 0.0
    for weight, name in [(1.0, food.name.lower()), *((0.95, alt.lower()) for alt in food.alt_names)]:
        for candidate in (name, *_WORD.findall(name)):
            best = max(best, weight * difflib.SequenceMatcher(None, text, candidate).ratio())
    return best


def _match(query: str, tokens: list[str], food: FoodDBM) -> str | None:
    """How a query matches a food. Whole words and word starts only: "oil" must not match "boiled", nor "ham" "khaman".
    A match on the food's own name beats a match on an alternate name."""
    name = food.name.lower()
    alts = [alt.lower() for alt in food.alt_names]
    if query == name or query in alts:
        return "exact"
    if name.startswith(query):
        return "prefix"
    words = set(_WORD.findall(food.search_text))
    if any(alt.startswith(query) for alt in alts) or all(any(w.startswith(token) for w in words) for token in tokens):
        return "contains"
    if all(any(w.startswith(token) for w in words) or difflib.get_close_matches(token, words, n=1, cutoff=0.78) for token in tokens):
        return "similar"
    return None


def search(
    db: Session,
    user: UserDBM,
    query: str,
    *,
    category: str | None = None,
    cuisine: str | None = None,
    scope: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> list[FoodSearchHit]:
    """Ranked matches on names, alternate names and common spellings. A blank query lists the library in its seed order.

    `scope` narrows to the user's own foods ("mine") or their favourites; `offset` pages through long results."""
    favourites = favourite_ids(db, user)
    overlays = overlays_for(db, user)
    stmt = select(FoodDBM).where(visible_to(user))
    if category:
        stmt = stmt.where(FoodDBM.category == category)
    if cuisine:
        stmt = stmt.where(FoodDBM.cuisine == cuisine)
    if scope == "mine":
        stmt = stmt.where(FoodDBM.user_id == user.id)
    elif scope == "favourites":
        stmt = stmt.where(FoodDBM.id.in_(favourites or {-1}))
    elif scope == "edited":
        stmt = stmt.where(FoodDBM.id.in_(set(overlays) or {-1}))
    foods = db.scalars(stmt.order_by(FoodDBM.position, FoodDBM.id)).all()

    text = " ".join(query.lower().split())
    tokens = _WORD.findall(text)
    page = slice(offset, offset + limit)
    if not tokens:
        return [FoodSearchHit(food=to_response(apply_overlay(food, overlays.get(food.id)), user, favourites), match="contains") for food in foods[page]]

    ranked: list[tuple[int, float, int, int, FoodDBM, str]] = []
    for food in foods:
        kind = _match(text, tokens, food)
        if kind:
            own_first = 0 if food.user_id == user.id else 1  # the user's own food wins ties
            # Fuzzy matches are ordered by how close they are; every other tie follows the library's curated order.
            nearness = -_closeness(text, food) if kind == "similar" else 0.0
            ranked.append((_MATCH_RANK[kind], nearness, own_first, food.position, food, kind))
    ranked.sort(key=lambda entry: entry[:4])
    return [FoodSearchHit(food=to_response(apply_overlay(food, overlays.get(food.id)), user, favourites), match=kind) for *_, food, kind in ranked[page]]  # type: ignore[arg-type]


# ---------- custom foods ----------


def _check_plausible(request: FoodCustomRequest) -> None:
    """Catches typos before they poison every total: nothing has more than 900 kcal per 100 g, and the macros cannot outweigh the serving."""
    per_100g = request.calories * 100.0 / request.serving_grams
    macro_grams = request.protein_g + request.carbs_g + request.fat_g + request.fibre_g
    if per_100g > 900:
        raise ValidationError(
            "That is more than 900 calories per 100 g, which no food has. Check the calories and serving weight.",
            errors={"calories": "Check this against the serving weight."},
        )
    if macro_grams > request.serving_grams * 1.02:
        raise ValidationError(
            "The protein, carbs, fat and fibre add up to more than the serving weighs. Check the numbers.",
            errors={"serving_grams": "Smaller than the nutrients in it."},
        )


def _apply_custom(food: FoodDBM, request: FoodCustomRequest) -> None:
    _check_plausible(request)
    factor = 100.0 / request.serving_grams
    label = request.serving_label.lower()
    food.name = request.name
    food.alt_names = []
    food.search_text = diet_seed_service.build_search_text(request.name, [])
    food.category = request.category or "other"
    food.calories = diet_calc_service.round1(request.calories * factor)
    food.protein_g = diet_calc_service.round1(request.protein_g * factor)
    food.carbs_g = diet_calc_service.round1(request.carbs_g * factor)
    food.fat_g = diet_calc_service.round1(request.fat_g * factor)
    food.fibre_g = diet_calc_service.round1(request.fibre_g * factor)
    food.serving_grams = {label: request.serving_grams}
    food.default_unit = label
    food.default_quantity = 1.0
    food.source = "Entered by you"
    food.verification = "user"
    food.confidence = 1.0


def create_custom(db: Session, user: UserDBM, request: FoodCustomRequest) -> FoodResponse:
    duplicate = db.scalar(
        select(FoodDBM.id).where(FoodDBM.user_id == user.id, func.lower(FoodDBM.name) == request.name.lower())
    )
    if duplicate:
        raise ConflictError("You already have a food with this name.")
    food = FoodDBM(user_id=user.id)
    _apply_custom(food, request)
    db.add(food)
    db.commit()
    db.refresh(food)
    return to_response(food, user, favourite_ids(db, user))


def _own_food(db: Session, user: UserDBM, food_id: int) -> FoodDBM:
    food = db.scalar(select(FoodDBM).where(FoodDBM.id == food_id, FoodDBM.user_id == user.id))
    if food is None:
        raise NotFoundError("Custom food not found.")
    return food


def update_custom(db: Session, user: UserDBM, food_id: int, request: FoodCustomRequest) -> FoodResponse:
    """Editing a custom food changes future logs only. Past meals keep the nutrients they were logged with."""
    food = _own_food(db, user, food_id)
    clash = db.scalar(
        select(FoodDBM.id).where(FoodDBM.user_id == user.id, FoodDBM.id != food.id, func.lower(FoodDBM.name) == request.name.lower())
    )
    if clash:
        raise ConflictError("You already have a food with this name.")
    _apply_custom(food, request)
    db.commit()
    db.refresh(food)
    return to_response(food, user, favourite_ids(db, user))


def delete_custom(db: Session, user: UserDBM, food_id: int) -> None:
    food = _own_food(db, user, food_id)
    db.delete(food)  # logged items keep their snapshot; their food link is cleared
    db.commit()


# ---------- a user's own values for a library food ----------


def _check_values_plausible(request: FoodValuesRequest) -> None:
    """Per 100 g the protein, carbs, fat and fibre cannot add up to more than 100 g."""
    macro_grams = request.protein_g + request.carbs_g + request.fat_g + request.fibre_g
    if macro_grams > 102:
        raise ValidationError(
            "Protein, carbs, fat and fibre add up to more than 100 g in 100 g of food. Check the numbers.",
            errors={"protein_g": "These add up to more than 100 g."},
        )


def _library_food(db: Session, food_id: int) -> FoodDBM:
    food = db.scalar(select(FoodDBM).where(FoodDBM.id == food_id, FoodDBM.user_id.is_(None)))
    if food is None:
        raise ValidationError("Only foods from the library can be edited this way. Edit your own foods directly.")
    return food


def save_values(db: Session, user: UserDBM, food_id: int, request: FoodValuesRequest) -> FoodResponse:
    """Stores this user's values for a library food. From now on search, logging, AI parsing and saved meals use them for this user only."""
    food = _library_food(db, food_id)
    _check_values_plausible(request)
    servings = request.serving_grams or dict(food.serving_grams)  # an untouched serving list keeps the library's
    overlay = db.scalar(select(FoodOverrideDBM).where(FoodOverrideDBM.user_id == user.id, FoodOverrideDBM.food_id == food_id))
    if overlay is None:
        overlay = FoodOverrideDBM(user_id=user.id, food_id=food_id)
        db.add(overlay)
    overlay.calories, overlay.protein_g, overlay.carbs_g = request.calories, request.protein_g, request.carbs_g
    overlay.fat_g, overlay.fibre_g, overlay.serving_grams = request.fat_g, request.fibre_g, servings
    try:
        db.commit()
    except IntegrityError:  # two saves at once: the other one created the row; apply ours to it
        db.rollback()
        overlay = db.scalar(select(FoodOverrideDBM).where(FoodOverrideDBM.user_id == user.id, FoodOverrideDBM.food_id == food_id))
        if overlay is None:
            raise
        overlay.calories, overlay.protein_g, overlay.carbs_g = request.calories, request.protein_g, request.carbs_g
        overlay.fat_g, overlay.fibre_g, overlay.serving_grams = request.fat_g, request.fibre_g, servings
        db.commit()
    return to_response(get_food(db, user, food_id), user, favourite_ids(db, user))


def reset_values(db: Session, user: UserDBM, food_id: int) -> FoodResponse:
    """Back to the library's values. Nothing already logged changes."""
    _library_food(db, food_id)
    overlay = db.scalar(select(FoodOverrideDBM).where(FoodOverrideDBM.user_id == user.id, FoodOverrideDBM.food_id == food_id))
    if overlay is not None:
        db.delete(overlay)
        db.commit()
    return to_response(get_food(db, user, food_id), user, favourite_ids(db, user))


# ---------- favourites and quick lists ----------


def set_favourite(db: Session, user: UserDBM, food_id: int, favourite: bool) -> None:
    get_food(db, user, food_id)
    existing = db.scalar(
        select(FoodFavouriteDBM).where(FoodFavouriteDBM.user_id == user.id, FoodFavouriteDBM.food_id == food_id)
    )
    if favourite and existing is None:
        db.add(FoodFavouriteDBM(user_id=user.id, food_id=food_id))
    elif not favourite and existing is not None:
        db.delete(existing)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # a double tap raced with itself; the favourite is already in place


def quick_foods(db: Session, user: UserDBM, *, limit: int = 12) -> QuickFoodsResponse:
    favourites = favourite_ids(db, user)

    def load(ids: list[int]) -> list[FoodResponse]:
        if not ids:
            return []
        rows = {f.id: f for f in db.scalars(select(FoodDBM).where(FoodDBM.id.in_(ids), visible_to(user))).all()}
        overlays = overlays_for(db, user)
        return [to_response(apply_overlay(rows[i], overlays.get(i)), user, favourites) for i in ids if i in rows]

    recent_ids: list[int] = []
    for food_id in db.scalars(
        select(FoodLogItemDBM.food_id)
        .join(FoodLogDBM, FoodLogDBM.id == FoodLogItemDBM.log_id)
        .where(FoodLogDBM.user_id == user.id, FoodLogItemDBM.food_id.is_not(None))
        .order_by(FoodLogItemDBM.id.desc())
        .limit(200)
    ):
        if food_id not in recent_ids:
            recent_ids.append(food_id)
        if len(recent_ids) >= limit:
            break

    since = today_ist() - timedelta(days=60)
    frequent_ids = list(
        db.scalars(
            select(FoodLogItemDBM.food_id)
            .join(FoodLogDBM, FoodLogDBM.id == FoodLogItemDBM.log_id)
            .where(FoodLogDBM.user_id == user.id, FoodLogItemDBM.food_id.is_not(None), FoodLogDBM.log_date >= since)
            .group_by(FoodLogItemDBM.food_id)
            .having(func.count() >= 2)
            .order_by(func.count().desc())
            .limit(limit)
        ).all()
    )
    return QuickFoodsResponse(
        favourites=load(sorted(favourites))[:limit], recent=load(recent_ids), frequent=load(frequent_ids)
    )


# ---------- quantity -> nutrients ----------


def nutrients_for(food: FoodDBM, quantity: float, unit: str) -> tuple[float, Nutrients]:
    """Grams and nutrients for `quantity` of `unit`. Only the food's own serving data is used for conversion."""
    grams = diet_calc_service.to_grams(quantity, unit, food.serving_grams)
    per_100g = Nutrients(food.calories, food.protein_g, food.carbs_g, food.fat_g, food.fibre_g)
    return grams, diet_calc_service.scale_per_100g(per_100g, grams)


def restriction_warnings(profile: DietProfileDBM | None, food: FoodDBM) -> list[str]:
    """Allergy, intolerance and diet conflicts for one food. A warning never blocks logging: the user ate what they ate."""
    if profile is None:
        return []
    tags = set(food.diet_tags)
    warnings: list[str] = []
    words = set(_WORD.findall(food.search_text))
    for kind, entries in (("allergy", profile.allergies), ("intolerance", profile.intolerances)):
        for entry in entries:
            # "peanut allergy" or "lactose intolerant" still mean peanut and lactose: look at every word, not the whole entry.
            entry_words = _WORD.findall(entry.lower())
            related = set().union(*(_ALLERGY_TAGS.get(w, set()) for w in entry_words)) if entry_words else set()
            named_in_food = any(w in words or any(fw.startswith(w) for fw in words if len(w) >= 4) for w in entry_words if w not in _FILLER_WORDS)
            if related & tags or named_in_food:
                warnings.append(f"{food.name} may conflict with your {kind}: {entry}. Check the ingredients.")
                break
    excluded = _DIET_EXCLUDES.get(profile.dietary_preference, set())
    if profile.dietary_preference == "pescatarian":
        excluded = set() if tags & {"fish", "shellfish"} else {"non_vegetarian"}
    if excluded & tags:
        warnings.append(f"{food.name} does not fit your {profile.dietary_preference.replace('_', ' ')} preference.")
    for entry in profile.disliked_foods:
        if entry.lower().strip() in food.search_text:
            warnings.append(f"You marked {entry} as a food you dislike.")
            break
    return warnings


def require_serving(food: FoodDBM, unit: str) -> None:
    """Raises a clear error early when a unit cannot be converted for this food."""
    if unit.strip().lower() not in diet_calc_service.FIXED_GRAM_UNITS and unit.strip().lower() not in food.serving_grams:
        raise ValidationError(
            f"{food.name} has no '{unit}' serving.",
            errors={"unit": f"Use one of: {', '.join(sorted(food.serving_grams))} or grams."},
        )
