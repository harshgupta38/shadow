from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.common import today_ist
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import NotFoundError, ValidationError
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.daily_report import ReportResponse
from app.schemas.reports import MonthlyReportResponse
from app.services import reports_service
from app.services.report_service import (
    delete_report,
    generate_report_background,
    get_reports,
    has_planned_items,
    send_report_email_background,
    to_report_response,
)

router = APIRouter(prefix=ENDPOINTS.REPORTS.PREFIX, tags=["Reports"])


@router.get(ENDPOINTS.REPORTS.MONTHLY, response_model=MonthlyReportResponse)
def get_monthly_report(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> MonthlyReportResponse:
    return reports_service.get_monthly_report(db, current_user, year, month)


@router.get(ENDPOINTS.REPORTS.REPORT_DETAIL, response_model=list[ReportResponse])
def get_report_detail(
    report_date: date,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[ReportResponse]:
    reports = get_reports(db, current_user.id, report_date)
    return [to_report_response(r) for r in reports]


@router.post(ENDPOINTS.REPORTS.GENERATE_REPORT_REQUEST)
async def request_report(
    report_date: date,
    background_tasks: BackgroundTasks,
    report_type: str = Query(default="daily", pattern="^(daily|weekly)$"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    if report_date > today_ist():
        raise ValidationError("Cannot generate a report for a future date.")
    if report_type == "weekly" and report_date.weekday() != 5:
        raise ValidationError("Weekly reports must be dated on a Saturday.")
    if not has_planned_items(db, current_user.id, report_date, report_type):
        return Response(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)
    background_tasks.add_task(generate_report_background, current_user.id, report_date, report_type, force=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(ENDPOINTS.REPORTS.EMAIL_REPORT_REQUEST, status_code=status.HTTP_204_NO_CONTENT)
def email_report(
    report_date: date,
    background_tasks: BackgroundTasks,
    report_type: str = Query(default="daily", pattern="^(daily|weekly)$"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    reports = [r for r in get_reports(db, current_user.id, report_date) if r.report_type == report_type]
    if not reports:
        raise NotFoundError("No report found for this date.")
    background_tasks.add_task(send_report_email_background, current_user.id, report_date, report_type)


@router.delete(ENDPOINTS.REPORTS.DELETE_REPORT, status_code=status.HTTP_204_NO_CONTENT)
def remove_report(
    report_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    delete_report(db, current_user.id, report_id)
