"""Report routes — list, generate, fetch."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, Provider
from app.models.enums import ReportPeriod
from app.schemas.report import ReportGenerateRequest, ReportRead
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=list[ReportRead])
def list_reports(
    db: DbSession, current_user: CurrentUser, period: ReportPeriod | None = None
) -> list[ReportRead]:
    return report_service.list_reports(db, current_user, period=period)


@router.post("/generate", response_model=ReportRead)
def generate_report(
    data: ReportGenerateRequest,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> ReportRead:
    return report_service.generate_report(
        db, current_user, provider, period=data.period, on_date=data.on_date
    )


@router.get("/{report_id}", response_model=ReportRead)
def get_report(report_id: int, db: DbSession, current_user: CurrentUser) -> ReportRead:
    return report_service.get_report(db, current_user, report_id)
