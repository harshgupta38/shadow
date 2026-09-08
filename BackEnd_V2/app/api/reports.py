from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from fastapi.responses import Response

from app.api.deps import get_current_user
from app.common.timezone import _IST
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import ValidationError
from app.db.session import get_db
from app.models.report import ReportDBM
from app.models.user import UserDBM
from app.schemas.daily_report import ReportResponse
from app.schemas.reports import MonthlyReportResponse
from app.services import reports_service
from app.services.report_service import generate_report_background, get_reports

router = APIRouter(prefix=ENDPOINTS.REPORTS.PREFIX, tags=["Reports"])


@router.get(ENDPOINTS.REPORTS.MONTHLY, response_model=MonthlyReportResponse)
def get_monthly_report(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> MonthlyReportResponse:
    return reports_service.get_monthly_report(db, current_user, year, month)


def _to_response(report: ReportDBM) -> ReportResponse:
    return ReportResponse.model_validate({
        "date": report.report_date,
        "report_type": report.report_type,
        "generated_at": report.generated_at,
        "alignment_score": report.alignment_score,
        "headline": report.headline,
        "summary": report.summary,
        "stats": report.stats,
        "goals": report.goals,
        "highlights": report.highlights,
        "closing": report.closing,
    })


@router.get(ENDPOINTS.REPORTS.REPORT_DETAIL, response_model=list[ReportResponse])
def get_report_detail(
    report_date: date,
    report_type: str = Query(default="daily", pattern="^(daily|weekly)$"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[ReportResponse]:
    reports = get_reports(db, current_user.id, report_date, report_type)
    return [_to_response(r) for r in reports]


@router.post(ENDPOINTS.REPORTS.GENERATE_REPORT_REQUEST, status_code=status.HTTP_204_NO_CONTENT)
async def request_report(
    report_date: date,
    background_tasks: BackgroundTasks,
    report_type: str = Query(default="daily", pattern="^(daily|weekly)$"),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    if report_date > datetime.now(_IST).date():
        raise ValidationError("Cannot generate a report for a future date.")
    if report_type == "weekly" and report_date.weekday() != 5:
        raise ValidationError("Weekly reports must be dated on a Saturday.")
    background_tasks.add_task(generate_report_background, current_user.id, report_date, report_type, force=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
