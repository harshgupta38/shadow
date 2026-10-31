"""The Food Logging agent: turns "I ate two chapatis and a bowl of rice for lunch" into a proposal the user reviews.

Division of labour:
  - the LLM (or, when it is unavailable, a rule-based parser) only splits the sentence into foods and amounts;
  - code finds the foods, converts servings, computes nutrients and totals;
  - nothing counts as eaten until the user confirms, and a proposal can be confirmed only once.
"""

import asyncio
import copy
import logging
import re
import uuid
from datetime import datetime, time, timezone
from time import perf_counter

from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.common.timezone import now_ist
from app.core.exceptions import NotFoundError, ValidationError
from app.llm.service import get_llm_service_for_ai_behavior
from app.models.diet import DietAgentRunDBM, DietProfileDBM, DietProposalDBM, FoodDBM
from app.models.user import UserDBM
from app.schemas.diet import (
    FoodResponse,
    NutrientTotals,
    ParseMealRequest,
    ProposalConfirmResponse,
    ProposalEditRequest,
    ProposalItemResponse,
    ProposalResponse,
    ProposalReviseRequest,
)
from app.schemas.diet_ai import (
    PARSE_SYSTEM_INSTRUCTION,
    REVISE_SYSTEM_INSTRUCTION,
    ParsedFoodItemLLM,
    ParsedMealLLM,
    RevisedMealLLM,
)
from app.services import diet_calc_service, diet_diary_service, diet_food_service, settings_service

_logger = logging.getLogger(__name__)

AGENT_FOOD_LOGGER = "food_logger"
_LLM_TIMEOUT_SECONDS = 30
_LLM_ATTEMPTS = 2
_MAX_ITEMS = 30

_UNIT_ALIASES = {
    "gram": "g", "grams": "g", "gm": "g", "gms": "g", "kilogram": "kg", "kilograms": "kg",
    "millilitre": "ml", "milliliter": "ml", "millilitres": "ml", "milliliters": "ml",
    "pieces": "piece", "pcs": "piece", "pc": "piece", "nos": "piece", "slices": "slice", "bowls": "bowl",
    "katoris": "katori", "cups": "cup", "glasses": "glass", "plates": "plate", "handfuls": "handful",
    "scoops": "scoop", "teaspoon": "tsp", "teaspoons": "tsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
}


# ---------- helpers ----------


def _unit_key(unit: str | None) -> str | None:
    if not unit or not unit.strip():
        return None
    key = unit.strip().lower().rstrip(".")
    return _UNIT_ALIASES.get(key, key)


def _infer_meal_type(moment: datetime) -> str:
    """Used only when neither the user nor the request names a meal; the review screen lets them change it."""
    hour = moment.hour + moment.minute / 60
    if hour < 10.5:
        return "breakfast"
    if hour < 12:
        return "morning_snack"
    if hour < 15.5:
        return "lunch"
    if hour < 18.5:
        return "evening_snack"
    return "dinner"


def _totals_model(item_nutrients: list[dict]) -> NutrientTotals:
    total = diet_calc_service.sum_nutrients([diet_calc_service.Nutrients(**n) for n in item_nutrients])
    return NutrientTotals(
        calories=total.calories, protein_g=total.protein_g, carbs_g=total.carbs_g, fat_g=total.fat_g, fibre_g=total.fibre_g
    )


def _find_food(db: Session, user: UserDBM, query: str):
    """Best library match for a food name. Tries the singular form before settling for a fuzzy match on the original."""
    query = query.strip()
    variants = [query]
    if query.lower().endswith("es") and len(query) > 4:
        variants.append(query[:-2])
    if query.lower().endswith("s") and len(query) > 3:
        variants.append(query[:-1])
    fuzzy = None
    for variant in variants:
        hits = diet_food_service.search(db, user, variant, limit=5)
        if hits and hits[0].match != "similar":
            return hits
        fuzzy = fuzzy or hits
    return fuzzy or []


def _price(item: dict, food: FoodDBM, quantity: float | None, unit: str | None, vague: bool = False) -> None:
    """Fills an item's amount and nutrients from a food, or marks it as still needing a quantity. Never guesses an amount."""
    item.update(food_id=food.id, name=food.name, nutrition_source=food.source, verification=food.verification)
    unit_key = _unit_key(unit)
    if unit_key is None and food.default_unit != "g":
        unit_key = food.default_unit  # a bare count such as "two chapatis" means the food's own unit
    typical = f"{food.default_quantity:g} {food.default_unit}"

    def pending(note: str) -> None:
        item.update(status="needs_quantity", quantity=None, unit=None, grams=None, nutrients=None, note=note)

    if quantity is None or vague:
        return pending(f"A typical amount is {typical}.")
    if unit_key is None:
        return pending(f"{quantity:g} of what? Say grams, or one of: {', '.join(sorted(food.serving_grams)) or 'g'}.")
    try:
        grams, nutrients = diet_food_service.nutrients_for(food, quantity, unit_key)
    except ValidationError as exc:
        if unit_key in diet_calc_service.FIXED_GRAM_UNITS or unit_key in food.serving_grams:
            return pending(f"{exc} Check the amount.")  # a known unit with an impossible amount, such as 200 glasses
        options = ", ".join(sorted(food.serving_grams)) or "grams"
        return pending(f"{food.name} has no '{unit_key}' size. Use grams or one of: {options}.")
    approximate = diet_calc_service.certainty_for_unit(unit_key) == "estimated"
    item.update(
        status="resolved",
        quantity=quantity,
        unit=unit_key,
        grams=grams,
        nutrients={
            "calories": nutrients.calories, "protein_g": nutrients.protein_g, "carbs_g": nutrients.carbs_g,
            "fat_g": nutrients.fat_g, "fibre_g": nutrients.fibre_g,
        },
        quantity_certainty="estimated" if approximate else "exact",
        note=f"Assumed 1 {unit_key} is about {food.serving_grams[unit_key]:g} g." if approximate and unit_key in food.serving_grams else "",
    )


def _new_item(db: Session, user: UserDBM, *, index: int, text: str, query: str, quantity: float | None, unit: str | None, vague: bool) -> dict:
    item: dict = {
        "index": index, "text": text, "status": "unmatched", "food_id": None, "name": "", "quantity": None, "unit": None,
        "grams": None, "nutrients": None, "verification": None, "nutrition_source": "", "quantity_certainty": "exact",
        "note": "", "candidate_ids": [],
    }
    hits = _find_food(db, user, query)
    if not hits:
        item["note"] = f"I couldn't find “{query}” in the food library."
        return item
    top = hits[0]
    food = diet_food_service.resolve_food(db, user, top.food.id)
    assert food is not None
    _price(item, food, quantity, unit, vague)
    item["candidate_ids"] = [h.food.id for h in hits[1:4]]
    if top.match in ("contains", "similar"):  # anything short of the name itself is a guess the user should see
        item["note"] = f"Matched “{query}” to {food.name}. Please check it is right. {item['note']}".strip()
    return item


def _reindex(items: list[dict]) -> list[dict]:
    for position, item in enumerate(items):
        item["index"] = position
    return items


# ---------- AI call with fallback ----------


def _record_run(db: Session, user: UserDBM, *, status: str, summary: str, started: float, provider: str = "", model: str = "",
                error: str = "", input_tokens: int = 0, output_tokens: int = 0) -> DietAgentRunDBM:
    run = DietAgentRunDBM(
        user_id=user.id, agent=AGENT_FOOD_LOGGER, status=status, provider=provider, model=model[:60], input_summary=summary[:300],
        error=error[:300], latency_ms=int((perf_counter() - started) * 1000), input_tokens=input_tokens, output_tokens=output_tokens,
    )
    db.add(run)
    db.flush()
    return run


async def _ask_llm(db: Session, user: UserDBM, *, system: str, content: str, schema: type[BaseModel], operation: str) -> tuple[BaseModel | None, DietAgentRunDBM]:
    """One structured call with a timeout and one retry. Returns (None, run) when the provider is unavailable so callers can fall back."""
    started = perf_counter()
    error = ""
    for attempt in range(1, _LLM_ATTEMPTS + 1):
        try:
            service = get_llm_service_for_ai_behavior(settings_service.get_ai_behavior(db, user.id))
            response = await asyncio.wait_for(
                # No temperature is sent: some models reject anything but their default, and code validates the output anyway.
                service.generate_structured(system_instruction=system, user_content=content, schema_cls=schema, user_id=user.id, operation=operation),
                timeout=_LLM_TIMEOUT_SECONDS,
            )
            usage = response.usage
            run = _record_run(
                db, user, status="ok", summary=content, started=started, provider=str(response.provider.value if hasattr(response.provider, "value") else response.provider),
                model=response.model_str or "", input_tokens=(usage.input_tokens or 0) if usage else 0, output_tokens=(usage.output_tokens or 0) if usage else 0,
            )
            return response.data, run
        except Exception as exc:  # a provider problem (incl. timeout) must never block logging food
            error = f"{type(exc).__name__}: {exc}"
            _logger.warning("Diet %s attempt %d failed: %s", operation, attempt, error)
            status = getattr(exc.__cause__, "status_code", None) or getattr(exc.__cause__, "code", None)  # OpenAI/Claude vs Gemini
            if isinstance(status, int) and 400 <= status < 500 and status != 429:
                break  # the provider rejected the request itself; trying again cannot help
    return None, _record_run(db, user, status="fallback", summary=content, started=started, error=error)


# ---------- rule-based fallback parser ----------

_NUMBER_WORDS = {"a": 1.0, "an": 1.0, "one": 1.0, "two": 2.0, "three": 3.0, "four": 4.0, "five": 5.0, "six": 6.0, "half": 0.5}
_UNIT_WORDS = (
    r"g|gm|gms|grams?|kg|ml|pieces?|pcs|slices?|bowls?|katoris?|cups?|glass(?:es)?|plates?|tbsp|tsp|tablespoons?|teaspoons?|scoops?|handfuls?"
)
_FRAGMENT = re.compile(
    rf"^(?:(?P<qty>\d+(?:\.\d+)?|\b(?:{'|'.join(_NUMBER_WORDS)})\b)\s*)?(?:(?P<unit>{_UNIT_WORDS})\b\s*)?(?:of\s+)?(?P<food>[a-z][a-z \-()']*)$"
)
_LEAD = re.compile(r"^(?:i\s+)?(?:just\s+|also\s+)?(?:ate|had|have|having|eating|eaten|consumed|took|drank)\s+")
_MEAL_WORDS = {"breakfast": "breakfast", "lunch": "lunch", "dinner": "dinner", "supper": "dinner", "snack": "evening_snack"}
_VAGUE = re.compile(r"\b(some|little|bit|lots?|few|bunch)\b")


def rule_parse(text: str) -> ParsedMealLLM:
    """Deterministic fallback for when the AI provider is down. Handles simple sentences; anything else becomes an unmatched item."""
    lowered = text.lower().strip()
    meal = next((value for word, value in _MEAL_WORDS.items() if re.search(rf"\b{word}\b", lowered)), None)
    lowered = re.sub(r"\b(?:for|at|in|during)\s+(?:my\s+|the\s+)?(?:breakfast|lunch|dinner|supper|snack)\b", " ", lowered)
    lowered = _LEAD.sub("", lowered.strip())
    items: list[ParsedFoodItemLLM] = []
    for fragment in re.split(r",|;|\band\b|\bwith\b|\bplus\b|\+", lowered):
        piece = _LEAD.sub("", fragment.strip().strip(".!"))
        if not piece:
            continue
        vague = bool(_VAGUE.search(piece))
        piece = _VAGUE.sub("", piece).strip()
        match = _FRAGMENT.match(piece)
        if not match:
            items.append(ParsedFoodItemLLM(text=fragment.strip(), food_query=piece, quantity=None, unit=None, quantity_is_vague=vague))
            continue
        raw_qty = match.group("qty")
        quantity = float(raw_qty) if raw_qty and raw_qty[0].isdigit() else _NUMBER_WORDS.get(raw_qty or "")
        items.append(
            ParsedFoodItemLLM(
                text=fragment.strip(), food_query=match.group("food").strip(), quantity=quantity,
                unit=match.group("unit"), quantity_is_vague=vague,
            )
        )
    return ParsedMealLLM(meal_type=meal, items=items[:_MAX_ITEMS])  # type: ignore[arg-type]


# ---------- proposals ----------


def _own_proposal(db: Session, user: UserDBM, proposal_id: str) -> DietProposalDBM:
    proposal = db.scalar(select(DietProposalDBM).where(DietProposalDBM.proposal_id == proposal_id, DietProposalDBM.user_id == user.id))
    if proposal is None:
        raise NotFoundError("Food log proposal not found.")
    return proposal


def _clarifications(items: list[dict]) -> list[str]:
    questions: list[str] = []
    for item in items:
        label = item["name"] or item["text"]
        if item["status"] == "needs_quantity":
            questions.append(f"How much {label}? {item['note']}".strip())
        elif item["status"] == "unmatched":
            questions.append(f"I couldn't find “{item['text']}”. Search for it or add it as your own food.")
    return questions


def to_response(db: Session, user: UserDBM, proposal: DietProposalDBM) -> ProposalResponse:
    payload = proposal.payload
    profile = db.get(DietProfileDBM, user.id)
    favourites = diet_food_service.favourite_ids(db, user)
    warnings: list[str] = []
    items: list[ProposalItemResponse] = []
    for raw in payload["items"]:
        candidates: list[FoodResponse] = []
        for food_id in raw.get("candidate_ids", []):
            food = diet_food_service.resolve_food(db, user, food_id)
            if food is not None:
                candidates.append(diet_food_service.to_response(food, user, favourites))
        units: list[str] = []
        food = diet_food_service.resolve_food(db, user, raw["food_id"]) if raw["food_id"] else None
        if food is not None:
            units = ["g", *sorted(food.serving_grams)]
            for warning in diet_food_service.restriction_warnings(profile, food):  # even before an amount is chosen
                if warning not in warnings:
                    warnings.append(warning)
        items.append(
            ProposalItemResponse(
                index=raw["index"], text=raw["text"], status=raw["status"], food_id=raw["food_id"], name=raw["name"],
                quantity=raw["quantity"], unit=raw["unit"], grams=raw["grams"],
                nutrients=NutrientTotals(**raw["nutrients"]) if raw["nutrients"] else None,
                verification=raw["verification"], nutrition_source=raw["nutrition_source"],
                quantity_certainty=raw["quantity_certainty"], note=raw["note"], candidates=candidates, units=units,
            )
        )
    resolved = [raw["nutrients"] for raw in payload["items"] if raw["status"] == "resolved" and raw["nutrients"]]
    return ProposalResponse(
        proposal_id=proposal.proposal_id,
        status=proposal.status,  # type: ignore[arg-type]
        source=proposal.source,  # type: ignore[arg-type]
        log_date=datetime.fromisoformat(payload["log_date"]).date(),
        meal_type=payload["meal_type"],
        eaten_at=time.fromisoformat(payload["eaten_at"]) if payload.get("eaten_at") else None,
        items=items,
        totals=_totals_model(resolved),
        clarifications=_clarifications(payload["items"]) if proposal.status == "pending" else [],
        warnings=warnings,
        can_confirm=proposal.status == "pending" and bool(items) and all(i.status == "resolved" for i in items),
        saved_log_id=proposal.saved_log_id,
    )


async def parse_meal(db: Session, user: UserDBM, request: ParseMealRequest) -> ProposalResponse:
    day = diet_diary_service.resolve_date(request.log_date)
    parsed, run = await _ask_llm(
        db, user, system=PARSE_SYSTEM_INSTRUCTION, content=request.text, schema=ParsedMealLLM, operation="diet_parse_meal"
    )
    if parsed is None:
        parsed = rule_parse(request.text)
    assert isinstance(parsed, ParsedMealLLM)
    if not parsed.items:
        db.commit()  # keep the run record
        raise ValidationError("I couldn't find any food in that message.", errors={"text": "Try something like “two chapatis and a bowl of dal for lunch”."})

    meal_type = diet_diary_service._validate_meal_type(request.meal_type) if request.meal_type else (parsed.meal_type or _infer_meal_type(now_ist()))
    items = _reindex(
        [
            _new_item(db, user, index=i, text=p.text, query=p.food_query, quantity=p.quantity, unit=p.unit, vague=p.quantity_is_vague)
            for i, p in enumerate(parsed.items[:_MAX_ITEMS])
        ]
    )
    proposal = DietProposalDBM(
        proposal_id=str(uuid.uuid4()), user_id=user.id, kind="food_log", status="pending", source="text", run_id=run.id,
        payload={"log_date": day.isoformat(), "meal_type": meal_type, "eaten_at": None, "original_text": request.text, "items": items},
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)
    return to_response(db, user, proposal)


def _require_pending(proposal: DietProposalDBM) -> None:
    if proposal.status != "pending":
        raise ValidationError("This food log has already been handled.")


def get_proposal(db: Session, user: UserDBM, proposal_id: str) -> ProposalResponse:
    return to_response(db, user, _own_proposal(db, user, proposal_id))


def edit_proposal(db: Session, user: UserDBM, proposal_id: str, request: ProposalEditRequest) -> ProposalResponse:
    """Applies the user's manual corrections. Edits refer to the item numbers they were shown."""
    proposal = _own_proposal(db, user, proposal_id)
    _require_pending(proposal)
    payload = copy.deepcopy(proposal.payload)
    items = payload["items"]
    by_index = {item["index"]: item for item in items}
    removed: set[int] = set()
    for edit in request.items:
        item = by_index.get(edit.index)
        if item is None:
            raise ValidationError(f"There is no item {edit.index}.")
        if edit.remove:
            removed.add(edit.index)
            continue
        food = diet_food_service.resolve_food(db, user, item["food_id"]) if item["food_id"] else None
        if edit.food_id is not None:
            food = diet_food_service.get_food(db, user, edit.food_id)
        if food is None:
            raise ValidationError("Pick a food for this item first.")
        _price(item, food, edit.quantity if edit.quantity is not None else item["quantity"], edit.unit or item["unit"])
        item["candidate_ids"] = [c for c in item.get("candidate_ids", []) if c != food.id]
        if edit.quantity is not None and item["status"] == "resolved" and item["quantity_certainty"] == "exact":
            item["note"] = ""
    payload["items"] = _reindex([item for item in items if item["index"] not in removed])
    if request.meal_type:
        payload["meal_type"] = diet_diary_service._validate_meal_type(request.meal_type)
    if request.log_date:
        payload["log_date"] = diet_diary_service.resolve_date(request.log_date).isoformat()
    if "eaten_at" in request.model_fields_set:
        payload["eaten_at"] = request.eaten_at.isoformat() if request.eaten_at else None
    proposal.payload = payload  # a new object, so the JSON column is saved
    db.commit()
    return to_response(db, user, proposal)


def _apply_operations(db: Session, user: UserDBM, payload: dict, revision: RevisedMealLLM) -> list[str]:
    """Applies the model's edit operations with code. Returns anything it could not apply."""
    problems: list[str] = []
    items: list[dict] = payload["items"]
    to_remove: set[int] = set()
    for op in revision.operations:
        target = items[op.item_index] if op.item_index is not None and 0 <= op.item_index < len(items) else None
        if op.action in ("set_quantity", "remove", "replace_food") and target is None:
            problems.append("I couldn't tell which item you meant.")
            continue
        if op.action == "remove":
            to_remove.add(target["index"])  # type: ignore[index]
        elif op.action == "set_quantity":
            food = diet_food_service.resolve_food(db, user, target["food_id"]) if target["food_id"] else None  # type: ignore[index]
            if food is None or op.quantity is None:
                problems.append("I couldn't change that amount.")
                continue
            _price(target, food, op.quantity, op.unit or target["unit"])  # type: ignore[arg-type]
        elif op.action == "replace_food":
            hits = _find_food(db, user, op.food_query or "")
            if not hits:
                problems.append(f"I couldn't find “{op.food_query}”.")
                continue
            food = diet_food_service.resolve_food(db, user, hits[0].food.id)
            assert food is not None and target is not None
            _price(target, food, target["quantity"], target["unit"])
            if hits[0].match in ("contains", "similar"):
                target["note"] = f"Matched “{op.food_query}” to {food.name}. Please check it is right. {target['note']}".strip()
        elif op.action == "add":
            if len(items) >= _MAX_ITEMS:
                problems.append("This meal already has the maximum number of foods.")
                continue
            items.append(_new_item(db, user, index=len(items), text=op.food_query or "", query=op.food_query or "", quantity=op.quantity, unit=op.unit, vague=False))
        elif op.action == "set_meal_type" and op.meal_type:
            payload["meal_type"] = op.meal_type
    payload["items"] = _reindex([i for i in items if i["index"] not in to_remove])
    return problems


async def revise_proposal(db: Session, user: UserDBM, proposal_id: str, request: ProposalReviseRequest) -> ProposalResponse:
    """A conversational correction ("Actually, three chapatis", "remove the rice"). Updates this proposal, never makes a second one."""
    proposal = _own_proposal(db, user, proposal_id)
    _require_pending(proposal)
    listing = "\n".join(
        f"{item['index']}: {item['name'] or item['text']} - {item['quantity'] if item['quantity'] is not None else 'no amount'} {item['unit'] or ''}".rstrip()
        for item in proposal.payload["items"]
    )
    content = f"Current meal ({proposal.payload['meal_type']}):\n{listing}\n\nPerson's message: {request.message}"
    revision, _run = await _ask_llm(db, user, system=REVISE_SYSTEM_INSTRUCTION, content=content, schema=RevisedMealLLM, operation="diet_revise_meal")
    if not isinstance(revision, RevisedMealLLM):
        db.commit()
        raise ValidationError("I couldn't process that correction right now. You can edit the items directly instead.")
    if not revision.understood or not revision.operations:
        db.commit()
        raise ValidationError("I couldn't tell what to change. Try “make the rice 200 g” or “remove the dal”.")
    payload = copy.deepcopy(proposal.payload)
    problems = _apply_operations(db, user, payload, revision)
    if problems and len(problems) == len(revision.operations):
        db.commit()
        raise ValidationError(" ".join(problems))
    proposal.payload = payload
    db.commit()
    return to_response(db, user, proposal)


def dismiss_proposal(db: Session, user: UserDBM, proposal_id: str) -> None:
    proposal = _own_proposal(db, user, proposal_id)
    if proposal.status == "pending":
        proposal.status = "dismissed"
        proposal.resolved_at = datetime.now(timezone.utc)
        db.commit()


def confirm_proposal(db: Session, user: UserDBM, proposal_id: str) -> ProposalConfirmResponse:
    """Saves the reviewed meal to the diary. Safe to call twice: the second call returns the meal already saved."""
    proposal = _own_proposal(db, user, proposal_id)
    if proposal.status == "saved" and proposal.saved_log_id:
        log = diet_diary_service._own_log(db, user, proposal.saved_log_id)
        return ProposalConfirmResponse(proposal=to_response(db, user, proposal), meal=diet_diary_service.meal_response(log))
    _require_pending(proposal)
    payload = proposal.payload
    unresolved = [i for i in payload["items"] if i["status"] != "resolved"]
    if not payload["items"] or unresolved:
        raise ValidationError("Every food needs a match and an amount before it can be saved.")

    day = datetime.fromisoformat(payload["log_date"]).date()
    eaten_at = time.fromisoformat(payload["eaten_at"]) if payload.get("eaten_at") else None
    # Build the whole meal first and claim the proposal last: get_or_create_log can roll back when two requests create the
    # same meal at once, and that must not undo the claim.
    log = diet_diary_service.get_or_create_log(db, user, day, payload["meal_type"], eaten_at)
    for raw in payload["items"]:
        food = diet_food_service.get_food(db, user, raw["food_id"])
        item = diet_diary_service.build_item(
            food, quantity=raw["quantity"], unit=raw["unit"], certainty=raw["quantity_certainty"], token=f"{proposal.proposal_id}:{raw['index']}"[:64]
        )
        diet_diary_service._append(log, item)
    db.flush()
    # If two confirms race, only one flips pending -> saved; the other discards its work and reads the winner's result.
    claimed = db.execute(
        update(DietProposalDBM).where(DietProposalDBM.id == proposal.id, DietProposalDBM.status == "pending").values(status="saved", resolved_at=datetime.now(timezone.utc))
    ).rowcount
    if claimed != 1:
        db.rollback()
        return confirm_proposal(db, user, proposal_id)
    proposal.saved_log_id = log.id
    db.commit()
    db.refresh(proposal)
    db.refresh(log)
    return ProposalConfirmResponse(proposal=to_response(db, user, proposal), meal=diet_diary_service.meal_response(log))
