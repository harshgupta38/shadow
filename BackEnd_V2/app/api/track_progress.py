from fastapi import APIRouter, Depends, Response, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.core.response_cache import TTL_SHORT_SECONDS, cached_json_response
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.habits import SetTrackingRequest
from app.schemas.track_progress import (
    EligibleHabitItem,
    EligibleTaskItem,
    HabitTrackItem,
    SetTaskTrackingRequest,
    TaskTrackItem,
)
from app.services import habits_service, settings_service, track_progress_service

router = APIRouter(prefix=ENDPOINTS.TRACK_PROGRESS.PREFIX, tags=["Track Progress"])


@router.get(ENDPOINTS.TRACK_PROGRESS.HABITS, response_model=list[HabitTrackItem])
def get_track_habits(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    def compute():
        week_starts_on = settings_service.get_week_starts_on(db, current_user.id)
        return track_progress_service.get_habits_with_history(db, current_user, week_starts_on=week_starts_on)

    return cached_json_response(db, current_user, "track.habits", compute, ttl=TTL_SHORT_SECONDS)


@router.get(ENDPOINTS.TRACK_PROGRESS.ELIGIBLE_HABITS, response_model=list[EligibleHabitItem])
def get_eligible_habits(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[EligibleHabitItem]:
    return track_progress_service.get_eligible_habits(db, current_user)


@router.post(ENDPOINTS.TRACK_PROGRESS.SET_TRACKING, status_code=status.HTTP_204_NO_CONTENT)
def set_tracking(
    data: SetTrackingRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    habits_service.set_tracking(db, current_user, data)


@router.get(ENDPOINTS.TRACK_PROGRESS.TASKS, response_model=list[TaskTrackItem])
def get_track_tasks(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> Response:
    def compute():
        week_starts_on = settings_service.get_week_starts_on(db, current_user.id)
        return track_progress_service.get_tasks_with_history(db, current_user, week_starts_on=week_starts_on)

    return cached_json_response(db, current_user, "track.tasks", compute, ttl=TTL_SHORT_SECONDS)


@router.get(ENDPOINTS.TRACK_PROGRESS.ELIGIBLE_TASKS, response_model=list[EligibleTaskItem])
def get_eligible_tasks(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[EligibleTaskItem]:
    return track_progress_service.get_eligible_tasks(db, current_user)


@router.post(ENDPOINTS.TRACK_PROGRESS.SET_TASK_TRACKING, status_code=status.HTTP_204_NO_CONTENT)
def set_task_tracking(
    data: SetTaskTrackingRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    track_progress_service.set_task_tracking(db, current_user, data)
