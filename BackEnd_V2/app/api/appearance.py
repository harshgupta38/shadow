from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.models.user import UserDBM
from app.services.solar_service import resolve_dynamic_theme

router = APIRouter(prefix=ENDPOINTS.APPEARANCE.PREFIX, tags=["appearance"])


@router.get(ENDPOINTS.APPEARANCE.DYNAMIC_RESOLVE)
def get_dynamic_theme(  # sync → FastAPI runs this in a thread pool, safe for urllib
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    _current_user: UserDBM = Depends(get_current_user),
) -> dict:
    return resolve_dynamic_theme(latitude, longitude)
