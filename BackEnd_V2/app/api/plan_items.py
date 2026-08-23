from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.plan_items import (
    PlanDataResponse,
    PlanStatusUpdateRequest,
    TodayPlanResponse,
)
from app.services import plan_service

router = APIRouter(prefix=ENDPOINTS.PLAN_ITEMS.PREFIX, tags=["Plan Items"])


@router.get(ENDPOINTS.PLAN_ITEMS.TODAY, response_model=TodayPlanResponse)
def get_today_plan(
    plan_date: date | None = Query(default=None, alias="date"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> TodayPlanResponse:
    query_date = plan_date if plan_date is not None else date.today()
    return plan_service.get_today_plan(db, current_user, query_date)


@router.patch(ENDPOINTS.PLAN_ITEMS.DETAIL, response_model=PlanDataResponse)
def update_plan_item_status(
    item_id: int,
    data: PlanStatusUpdateRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> PlanDataResponse:
    return plan_service.update_item_status(db, current_user, item_id, data)
