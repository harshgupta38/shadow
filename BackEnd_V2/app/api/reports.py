from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.reports import MonthlyReportResponse
from app.services import reports_service

router = APIRouter(prefix=ENDPOINTS.REPORTS.PREFIX, tags=["Reports"])


@router.get(ENDPOINTS.REPORTS.MONTHLY, response_model=MonthlyReportResponse)
def get_monthly_report(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> MonthlyReportResponse:
    return reports_service.get_monthly_report(db, current_user, year, month)
