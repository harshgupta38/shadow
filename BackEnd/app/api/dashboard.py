"""Dashboard route — one aggregated summary for the home screen."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import DashboardSummary
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def summary(db: DbSession, current_user: CurrentUser) -> DashboardSummary:
    return dashboard_service.build_summary(db, current_user)
