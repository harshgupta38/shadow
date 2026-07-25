from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.core.endpoints import ENDPOINTS
from app.schemas.onboarding import InterviewQuestionResponse
from app.services import onboarding_service

router = APIRouter(prefix=ENDPOINTS.ONBOARDING.PREFIX, tags=["Onboarding"])


@router.get(ENDPOINTS.ONBOARDING.QUESTION, response_model=InterviewQuestionResponse)
def get_next_question(
    current_user: CurrentUser,
) -> InterviewQuestionResponse:
    return onboarding_service.get_next_question()
