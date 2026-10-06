from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_current_user
from app.common import today_ist
from app.core.endpoints import ENDPOINTS
from app.core.response_cache import TTL_STANDARD_SECONDS, cached_json_response
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.profile import ProfileResponse, UpdateBioRequest, UsageResponse
from app.services import profile_service

router = APIRouter(prefix=ENDPOINTS.PROFILE.PREFIX, tags=["Profile"])


@router.get(ENDPOINTS.PROFILE.ROOT, response_model=ProfileResponse)
def get_profile(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    return cached_json_response(
        db, current_user, "profile",
        lambda: profile_service.get_profile(db, current_user),
        ttl=TTL_STANDARD_SECONDS,
    )


@router.patch(ENDPOINTS.PROFILE.BIO, response_model=ProfileResponse)
def update_bio(
    data: UpdateBioRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ProfileResponse:
    return profile_service.update_bio(db, current_user, data.bio)


@router.get(ENDPOINTS.PROFILE.USAGE, response_model=UsageResponse)
def get_usage(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
) -> UsageResponse:
    today = today_ist()
    return profile_service.get_usage(
        db, current_user.id,
        year=year if year is not None else today.year,
        month=month if month is not None else today.month,
    )
