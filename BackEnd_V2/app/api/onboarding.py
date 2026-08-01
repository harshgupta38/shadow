from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core.endpoints import ENDPOINTS
from app.schemas.onboarding import FoundationSaveRequest, FoundationSaveResponse

router = APIRouter(prefix=ENDPOINTS.ONBOARDING.PREFIX, tags=["Onboarding"])


@router.post(ENDPOINTS.ONBOARDING.FOUNDATION, response_model=FoundationSaveResponse)
def save_foundation(
    data: FoundationSaveRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> FoundationSaveResponse:
    current_user.name = data.name
    current_user.gender = data.gender
    
    current_user.birth_day = data.birthDay
    current_user.birth_month = data.birthMonth
    current_user.birth_year = data.birthYear

    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    return FoundationSaveResponse()
