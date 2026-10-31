import logging
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from fastapi.responses import JSONResponse, Response

from app.api.deps import get_current_user
from app.common import today_ist
from app.core.endpoints import ENDPOINTS
from app.core.exceptions import AppError, NotFoundError, ServiceUnavailableError, ValidationError
from app.core.response_cache import TTL_STANDARD_SECONDS, cached_json_response
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.daily_report import ReportResponse
from app.schemas.reports import MonthlyReportResponse
from app.services import email_notification_service, email_service, report_email_limit_service, reports_service, weekly_insights_service
from app.services.report_service import (
    delete_report,
    generate_report_background,
    get_reports,
    has_planned_items,
    to_report_response,
)

router = APIRouter(prefix=ENDPOINTS.REPORTS.PREFIX, tags=["Reports"])
logger = logging.getLogger(__name__)


@router.get(ENDPOINTS.REPORTS.MONTHLY, response_model=MonthlyReportResponse)
def get_monthly_report(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    return cached_json_response(
        db, current_user, "reports.monthly",
        lambda: reports_service.get_monthly_report(db, current_user, year, month),
        ttl=TTL_STANDARD_SECONDS,
        params=(year, month),
    )


@router.get(ENDPOINTS.REPORTS.REPORT_DETAIL, response_model=list[ReportResponse])
def get_report_detail(
    report_date: date,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[ReportResponse]:
    reports = get_reports(db, current_user.id, report_date)
    # Weekly reports generated before insights existed are filled in on first open.
    weekly_insights_service.ensure_weekly_insights(db, reports)
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
    report_type: str = Query(default="daily", pattern="^(daily|weekly)$"),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    if not email_service.smtp_configured():
        raise AppError("Email is not set up on this server, so the report was not sent.")
    reports = [r for r in get_reports(db, current_user.id, report_date) if r.report_type == report_type]
    if not reports:
        raise NotFoundError("No report found for this date.")
    report = to_report_response(reports[0])
    # The gate comes before the cooldown claim, so a full gate never uses up the user's send. The gate is per
    # process; the cooldown lives in the database and is shared by all workers.
    if not report_email_limit_service.try_acquire_send_slot():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"message": "Too many report emails are being sent right now. Please try again in a few seconds."},
            headers={"Retry-After": "10"},
        )
    # Sync endpoint: FastAPI runs it in a worker thread. The send holds that thread for at most about 20 s
    # (the interactive send budget), and the gate keeps at most a few threads busy with sends at once.
    try:
        # The cooldown starts here, before the send, so a failed send uses it up too: retries must not keep hitting
        # an SMTP server that is down. Requests refused above (404, SMTP off, full gate) never reach this line.
        report_email_limit_service.claim_send(db, current_user.id)  # commits, so no DB lock is held during SMTP
        try:
            sent = email_notification_service.send_report_email(db, current_user, report, force=True, interactive=True)
        except Exception:
            logger.exception("Manual report email failed for user=%s date=%s", current_user.id, report_date)
            sent = False
        if not sent:
            raise ServiceUnavailableError("The report email could not be sent. Please try again in a minute.")
    finally:
        report_email_limit_service.release_send_slot()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(ENDPOINTS.REPORTS.DELETE_REPORT, status_code=status.HTTP_204_NO_CONTENT)
def remove_report(
    report_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    delete_report(db, current_user.id, report_id)
