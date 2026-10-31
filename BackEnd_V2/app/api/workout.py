from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_user
from app.core.endpoints import ENDPOINTS
from app.db.session import get_db
from app.models.user import UserDBM
from app.schemas.workout import (
    ExerciseDetailResponse,
    ExerciseSummaryResponse,
    PlanSource,
    SessionSaveRequest,
    SessionStartRequest,
    WorkoutOverviewResponse,
    WorkoutPlanDetailResponse,
    WorkoutPlanSaveRequest,
    WorkoutPlanSummaryResponse,
    WorkoutProgressResponse,
    WorkoutSessionDetailResponse,
    WorkoutSessionSummaryResponse,
)
from app.services import (
    workout_insights_service,
    workout_library_service,
    workout_plans_service,
    workout_sessions_service,
)

router = APIRouter(prefix=ENDPOINTS.WORKOUT.PREFIX, tags=["Workout"])


# ── Overview and progress ─────────────────────────────────────────────────────


@router.get(ENDPOINTS.WORKOUT.OVERVIEW, response_model=WorkoutOverviewResponse)
def get_overview(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutOverviewResponse:
    return workout_insights_service.overview(db, current_user)


@router.get(ENDPOINTS.WORKOUT.PROGRESS, response_model=WorkoutProgressResponse)
def get_progress(
    weeks: int = Query(default=8, ge=1, le=52),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutProgressResponse:
    return workout_insights_service.progress(db, current_user, weeks)


# ── Exercise library ──────────────────────────────────────────────────────────


@router.get(ENDPOINTS.WORKOUT.EXERCISES, response_model=list[ExerciseSummaryResponse])
def list_exercises(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[ExerciseSummaryResponse]:
    return workout_library_service.list_exercises(db)


@router.get(ENDPOINTS.WORKOUT.EXERCISE_DETAIL, response_model=ExerciseDetailResponse)
def get_exercise(
    exercise_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> ExerciseDetailResponse:
    return workout_library_service.get_exercise(db, current_user.id, exercise_id)


# ── Plans ─────────────────────────────────────────────────────────────────────


@router.get(ENDPOINTS.WORKOUT.PLANS, response_model=list[WorkoutPlanSummaryResponse])
def list_plans(
    source: PlanSource | None = None,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[WorkoutPlanSummaryResponse]:
    return workout_plans_service.list_plans(db, current_user, source)


@router.post(
    ENDPOINTS.WORKOUT.PLANS,
    response_model=WorkoutPlanDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_plan(
    data: WorkoutPlanSaveRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutPlanDetailResponse:
    return workout_plans_service.create_plan(db, current_user, data)


@router.post(ENDPOINTS.WORKOUT.PLANS_DEACTIVATE, status_code=status.HTTP_204_NO_CONTENT)
def deactivate_plan(
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    workout_plans_service.deactivate_plan(db, current_user)


@router.get(ENDPOINTS.WORKOUT.PLAN_DETAIL, response_model=WorkoutPlanDetailResponse)
def get_plan(
    plan_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutPlanDetailResponse:
    return workout_plans_service.get_plan(db, current_user, plan_id)


@router.get(ENDPOINTS.WORKOUT.PLAN_DAY_WARM_UPS, response_model=list[ExerciseSummaryResponse])
def plan_day_warm_ups(
    plan_id: int,
    weekday: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[ExerciseSummaryResponse]:
    return workout_plans_service.day_warm_ups(db, current_user, plan_id, weekday)


@router.put(ENDPOINTS.WORKOUT.PLAN_DETAIL, response_model=WorkoutPlanDetailResponse)
def update_plan(
    plan_id: int,
    data: WorkoutPlanSaveRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutPlanDetailResponse:
    return workout_plans_service.update_plan(db, current_user, plan_id, data)


@router.delete(ENDPOINTS.WORKOUT.PLAN_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    workout_plans_service.delete_plan(db, current_user, plan_id)


@router.post(ENDPOINTS.WORKOUT.PLAN_ACTIVATE, response_model=WorkoutPlanSummaryResponse)
def activate_plan(
    plan_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutPlanSummaryResponse:
    return workout_plans_service.activate_plan(db, current_user, plan_id)


@router.post(
    ENDPOINTS.WORKOUT.PLAN_DUPLICATE,
    response_model=WorkoutPlanDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_plan(
    plan_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutPlanDetailResponse:
    return workout_plans_service.duplicate_plan(db, current_user, plan_id)


# ── Sessions ──────────────────────────────────────────────────────────────────


@router.get(ENDPOINTS.WORKOUT.SESSIONS, response_model=list[WorkoutSessionSummaryResponse])
def list_sessions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> list[WorkoutSessionSummaryResponse]:
    return workout_sessions_service.list_sessions(db, current_user, limit, offset)


@router.post(
    ENDPOINTS.WORKOUT.SESSIONS,
    response_model=WorkoutSessionDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_session(
    data: SessionStartRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutSessionDetailResponse:
    return workout_sessions_service.start_session(db, current_user, data)


@router.get(ENDPOINTS.WORKOUT.SESSION_DETAIL, response_model=WorkoutSessionDetailResponse)
def get_session(
    session_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutSessionDetailResponse:
    return workout_sessions_service.get_session(db, current_user, session_id)


@router.patch(ENDPOINTS.WORKOUT.SESSION_DETAIL, response_model=WorkoutSessionDetailResponse)
def save_session(
    session_id: int,
    data: SessionSaveRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutSessionDetailResponse:
    return workout_sessions_service.save_session(db, current_user, session_id, data)


@router.post(ENDPOINTS.WORKOUT.SESSION_FINISH, response_model=WorkoutSessionDetailResponse)
def finish_session(
    session_id: int,
    data: SessionSaveRequest,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> WorkoutSessionDetailResponse:
    return workout_sessions_service.finish_session(db, current_user, session_id, data)


@router.delete(ENDPOINTS.WORKOUT.SESSION_DETAIL, status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db=Depends(get_db),
    current_user: UserDBM = Depends(get_current_user),
) -> None:
    workout_sessions_service.delete_session(db, current_user, session_id)
