from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.reports import MonthlyReportResponse
from app.services import reports_service
from app.services.report_service import generate_report_background

_IST = timezone(timedelta(hours=5, minutes=30))

router = APIRouter(prefix=ENDPOINTS.REPORTS.PREFIX, tags=["Reports"])


@router.get(ENDPOINTS.REPORTS.MONTHLY, response_model=MonthlyReportResponse)
def get_monthly_report(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> MonthlyReportResponse:
    return reports_service.get_monthly_report(db, current_user, year, month)


@router.post(ENDPOINTS.REPORTS.GENERATE_REPORT_REQUEST, status_code=status.HTTP_204_NO_CONTENT)
async def request_report(
    report_date: date,
    background_tasks: BackgroundTasks,
    report_type: str = Query(default="daily", pattern="^(daily|weekly)$"),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    if report_date > datetime.now(_IST).date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate a report for a future date.",
        )
    background_tasks.add_task(generate_report_background, current_user.id, report_date, report_type)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
