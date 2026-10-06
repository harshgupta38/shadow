from fastapi import APIRouter, Depends, Response

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.core.response_cache import TTL_SHORT_SECONDS, cached_json_response
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.dashboard import DashboardResponse
from app.services import dashboard_service

router = APIRouter(prefix=ENDPOINTS.DASHBOARD.PREFIX, tags=["Dashboard"])


@router.get(ENDPOINTS.DASHBOARD.ROOT, response_model=DashboardResponse)
def get_dashboard(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    return cached_json_response(
        db, current_user, "dashboard",
        lambda: dashboard_service.get_dashboard(db, current_user),
        ttl=TTL_SHORT_SECONDS,
    )
