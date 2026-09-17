from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.profile import ProfileResponse, UpdateBioRequest
from app.services import profile_service

router = APIRouter(prefix=ENDPOINTS.PROFILE.PREFIX, tags=["Profile"])


@router.get(ENDPOINTS.PROFILE.ROOT, response_model=ProfileResponse)
def get_profile(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ProfileResponse:
    return profile_service.get_profile(db, current_user)


@router.patch(ENDPOINTS.PROFILE.BIO, response_model=ProfileResponse)
def update_bio(
    data: UpdateBioRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ProfileResponse:
    return profile_service.update_bio(db, current_user, data.bio)
