from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.diet import (
    CopyMealsRequest,
    CopyMealsResponse,
    DiaryAddRequest,
    DiaryDayResponse,
    DiaryItemMoveRequest,
    DiaryItemUpdateRequest,
    DiaryMealResponse,
    DiaryMealUpdateRequest,
    EstimateRequest,
    EstimateResponse,
    FoodCustomRequest,
    FoodResponse,
    FoodSearchHit,
    FoodValuesRequest,
    OverviewResponse,
    ParseMealRequest,
    ProfileResponse,
    ProfileSaveRequest,
    ProfileStateResponse,
    ProposalConfirmResponse,
    ProposalEditRequest,
    ProposalResponse,
    ProposalReviseRequest,
    QuickFoodsResponse,
    SavedMealCreateRequest,
    SavedMealLogRequest,
    SavedMealResponse,
    WaterAddRequest,
    WaterDayResponse,
    WaterHistoryPoint,
)
from app.services import (
    diet_diary_service,
    diet_food_service,
    diet_overview_service,
    diet_profile_service,
    diet_proposal_service,
    diet_water_service,
)

router = APIRouter(prefix=ENDPOINTS.DIET.PREFIX, tags=["Diet"])


# ── Profile and targets ───────────────────────────────────────────────────────


@router.get(ENDPOINTS.DIET.PROFILE, response_model=ProfileStateResponse)
def get_profile(db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> ProfileStateResponse:
    return diet_profile_service.get_state(db, current_user)


@router.put(ENDPOINTS.DIET.PROFILE, response_model=ProfileResponse)
def save_profile(
    request: ProfileSaveRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> ProfileResponse:
    return diet_profile_service.save_profile(db, current_user, request)


@router.post(ENDPOINTS.DIET.PROFILE_ESTIMATE, response_model=EstimateResponse)
def estimate_targets(request: EstimateRequest, current_user: UserDBM = Depends(get_current_user)) -> EstimateResponse:
    return diet_profile_service.estimate(request)


# ── Overview ──────────────────────────────────────────────────────────────────


@router.get(ENDPOINTS.DIET.OVERVIEW, response_model=OverviewResponse)
def get_overview(
    day: date | None = Query(default=None, alias="date"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> OverviewResponse:
    return diet_overview_service.get_overview(db, current_user, day)


# ── Food library ──────────────────────────────────────────────────────────────


@router.get(ENDPOINTS.DIET.FOODS, response_model=list[FoodSearchHit])
def search_foods(
    q: str = Query(default="", max_length=100),
    category: str | None = Query(default=None, max_length=40),
    cuisine: str | None = Query(default=None, max_length=40),
    scope: Literal["all", "mine", "favourites", "edited"] = "all",
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=5000),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[FoodSearchHit]:
    return diet_food_service.search(db, current_user, q, category=category, cuisine=cuisine, scope=scope, limit=limit, offset=offset)


@router.post(ENDPOINTS.DIET.FOODS, response_model=FoodResponse, status_code=status.HTTP_201_CREATED)
def create_food(
    request: FoodCustomRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> FoodResponse:
    return diet_food_service.create_custom(db, current_user, request)


@router.get(ENDPOINTS.DIET.FOODS_QUICK, response_model=QuickFoodsResponse)
def quick_foods(db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> QuickFoodsResponse:
    return diet_food_service.quick_foods(db, current_user)


@router.get(ENDPOINTS.DIET.FOOD_DETAIL, response_model=FoodResponse)
def get_food(food_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> FoodResponse:
    food = diet_food_service.get_food(db, current_user, food_id)
    return diet_food_service.to_response(food, current_user, diet_food_service.favourite_ids(db, current_user))


@router.put(ENDPOINTS.DIET.FOOD_DETAIL, response_model=FoodResponse)
def update_food(
    food_id: int, request: FoodCustomRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> FoodResponse:
    return diet_food_service.update_custom(db, current_user, food_id, request)


@router.delete(ENDPOINTS.DIET.FOOD_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_food(food_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> None:
    diet_food_service.delete_custom(db, current_user, food_id)


@router.put(ENDPOINTS.DIET.FOOD_OVERRIDE, response_model=FoodResponse)
def save_food_values(
    food_id: int, request: FoodValuesRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> FoodResponse:
    return diet_food_service.save_values(db, current_user, food_id, request)


@router.delete(ENDPOINTS.DIET.FOOD_OVERRIDE, response_model=FoodResponse)
def reset_food_values(food_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> FoodResponse:
    return diet_food_service.reset_values(db, current_user, food_id)


@router.put(ENDPOINTS.DIET.FOOD_FAVOURITE, status_code=status.HTTP_204_NO_CONTENT)
def add_favourite(food_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> None:
    diet_food_service.set_favourite(db, current_user, food_id, True)


@router.delete(ENDPOINTS.DIET.FOOD_FAVOURITE, status_code=status.HTTP_204_NO_CONTENT)
def remove_favourite(food_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> None:
    diet_food_service.set_favourite(db, current_user, food_id, False)


# ── Food diary ────────────────────────────────────────────────────────────────


@router.get(ENDPOINTS.DIET.DIARY, response_model=DiaryDayResponse)
def get_diary(
    day: date | None = Query(default=None, alias="date"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> DiaryDayResponse:
    return diet_diary_service.get_day(db, current_user, day)


@router.post(ENDPOINTS.DIET.DIARY_ITEMS, response_model=DiaryMealResponse, status_code=status.HTTP_201_CREATED)
def add_diary_items(
    request: DiaryAddRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> DiaryMealResponse:
    return diet_diary_service.add_items(db, current_user, request)


@router.patch(ENDPOINTS.DIET.DIARY_ITEM, response_model=DiaryMealResponse)
def update_diary_item(
    item_id: int, request: DiaryItemUpdateRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> DiaryMealResponse:
    return diet_diary_service.update_item(db, current_user, item_id, request)


@router.delete(ENDPOINTS.DIET.DIARY_ITEM, status_code=status.HTTP_204_NO_CONTENT)
def delete_diary_item(item_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> None:
    diet_diary_service.delete_item(db, current_user, item_id)


@router.post(ENDPOINTS.DIET.DIARY_ITEM_MOVE, response_model=DiaryMealResponse)
def move_diary_item(
    item_id: int, request: DiaryItemMoveRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> DiaryMealResponse:
    return diet_diary_service.move_item(db, current_user, item_id, request)


@router.post(ENDPOINTS.DIET.DIARY_ITEM_DUPLICATE, response_model=DiaryMealResponse, status_code=status.HTTP_201_CREATED)
def duplicate_diary_item(
    item_id: int,
    request: DiaryItemMoveRequest | None = None,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> DiaryMealResponse:
    return diet_diary_service.duplicate_item(db, current_user, item_id, request)


@router.patch(ENDPOINTS.DIET.DIARY_MEAL, response_model=DiaryMealResponse)
def update_diary_meal(
    log_id: int, request: DiaryMealUpdateRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> DiaryMealResponse:
    return diet_diary_service.update_meal(db, current_user, log_id, request)


@router.delete(ENDPOINTS.DIET.DIARY_MEAL, status_code=status.HTTP_204_NO_CONTENT)
def delete_diary_meal(log_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> None:
    diet_diary_service.delete_meal(db, current_user, log_id)


@router.post(ENDPOINTS.DIET.DIARY_COPY, response_model=CopyMealsResponse)
def copy_meals(
    request: CopyMealsRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> CopyMealsResponse:
    return diet_diary_service.copy_meals(db, current_user, request)


# ── Saved meals ───────────────────────────────────────────────────────────────


@router.get(ENDPOINTS.DIET.SAVED_MEALS, response_model=list[SavedMealResponse])
def list_saved_meals(db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> list[SavedMealResponse]:
    return diet_diary_service.list_saved_meals(db, current_user)


@router.post(ENDPOINTS.DIET.SAVED_MEALS, response_model=SavedMealResponse, status_code=status.HTTP_201_CREATED)
def create_saved_meal(
    request: SavedMealCreateRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> SavedMealResponse:
    return diet_diary_service.create_saved_meal(db, current_user, request)


@router.delete(ENDPOINTS.DIET.SAVED_MEAL, status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_meal(saved_id: int, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> None:
    diet_diary_service.delete_saved_meal(db, current_user, saved_id)


@router.post(ENDPOINTS.DIET.SAVED_MEAL_LOG, response_model=DiaryMealResponse, status_code=status.HTTP_201_CREATED)
def log_saved_meal(
    saved_id: int, request: SavedMealLogRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> DiaryMealResponse:
    return diet_diary_service.log_saved_meal(db, current_user, saved_id, request)


# ── Water ─────────────────────────────────────────────────────────────────────


@router.get(ENDPOINTS.DIET.WATER, response_model=WaterDayResponse)
def get_water(
    day: date | None = Query(default=None, alias="date"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WaterDayResponse:
    return diet_water_service.get_day(db, current_user, day)


@router.post(ENDPOINTS.DIET.WATER, response_model=WaterDayResponse, status_code=status.HTTP_201_CREATED)
def add_water(
    request: WaterAddRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> WaterDayResponse:
    return diet_water_service.add(db, current_user, request)


@router.get(ENDPOINTS.DIET.WATER_HISTORY, response_model=list[WaterHistoryPoint])
def water_history(
    days: int = Query(default=7, ge=1, le=90), db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> list[WaterHistoryPoint]:
    return diet_water_service.history(db, current_user, days)


# ── AI food logging (propose, review, confirm) ────────────────────────────────


@router.post(ENDPOINTS.DIET.LOG_PARSE, response_model=ProposalResponse, status_code=status.HTTP_201_CREATED)
async def parse_meal(
    request: ParseMealRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> ProposalResponse:
    return await diet_proposal_service.parse_meal(db, current_user, request)


@router.get(ENDPOINTS.DIET.PROPOSAL, response_model=ProposalResponse)
def get_proposal(proposal_id: str, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> ProposalResponse:
    return diet_proposal_service.get_proposal(db, current_user, proposal_id)


@router.patch(ENDPOINTS.DIET.PROPOSAL, response_model=ProposalResponse)
def edit_proposal(
    proposal_id: str, request: ProposalEditRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> ProposalResponse:
    return diet_proposal_service.edit_proposal(db, current_user, proposal_id, request)


@router.delete(ENDPOINTS.DIET.PROPOSAL, status_code=status.HTTP_204_NO_CONTENT)
def dismiss_proposal(proposal_id: str, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)) -> None:
    diet_proposal_service.dismiss_proposal(db, current_user, proposal_id)


@router.post(ENDPOINTS.DIET.PROPOSAL_REVISE, response_model=ProposalResponse)
async def revise_proposal(
    proposal_id: str, request: ProposalReviseRequest, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> ProposalResponse:
    return await diet_proposal_service.revise_proposal(db, current_user, proposal_id, request)


@router.post(ENDPOINTS.DIET.PROPOSAL_CONFIRM, response_model=ProposalConfirmResponse)
def confirm_proposal(
    proposal_id: str, db=Depends(get_db), current_user: UserDBM = Depends(get_current_user)
) -> ProposalConfirmResponse:
    return diet_proposal_service.confirm_proposal(db, current_user, proposal_id)
