from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.dashboard import DashboardResponse
from app.services import dashboard_service

router = APIRouter(prefix=ENDPOINTS.DASHBOARD.PREFIX, tags=["Dashboard"])


@router.get(ENDPOINTS.DASHBOARD.ROOT, response_model=DashboardResponse)
def get_dashboard(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> DashboardResponse:
    return dashboard_service.get_dashboard(db, current_user)
