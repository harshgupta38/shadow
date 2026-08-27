from datetime import date

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.planner import DailyPlanResponse, DailyPlanSavedData, UpdatePlanRequest
from app.services import planner_service

router = APIRouter(prefix=ENDPOINTS.PLANNER.PREFIX, tags=["Planner"])


@router.get(ENDPOINTS.PLANNER.FOR_DATE, response_model=DailyPlanResponse)
def get_plans_for_date(
    date: date,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> DailyPlanResponse:
    return planner_service.get_plans_for_date(db, current_user, date)


@router.patch(ENDPOINTS.PLANNER.RECORD, response_model=DailyPlanSavedData)
def update_daily_record(
    record_id: int,
    body: UpdatePlanRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> DailyPlanSavedData:
    return planner_service.update_daily_record(
        db,
        current_user,
        record_id,
        status=body.status,
        actual_value=body.actual_value,
        note=body.note,
    )
