from fastapi import APIRouter, Depends, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.habits import SetTrackingRequest
from app.schemas.track_progress import HabitTrackItem
from app.services import habits_service, track_progress_service

router = APIRouter(prefix=ENDPOINTS.TRACK_PROGRESS.PREFIX, tags=["Track Progress"])


@router.get(ENDPOINTS.TRACK_PROGRESS.HABITS, response_model=list[HabitTrackItem])
def get_track_habits(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[HabitTrackItem]:
    return track_progress_service.get_habits_with_history(db, current_user)


@router.post(ENDPOINTS.TRACK_PROGRESS.SET_TRACKING, status_code=status.HTTP_204_NO_CONTENT)
def set_tracking(
    data: SetTrackingRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    habits_service.set_tracking(db, current_user, data)
