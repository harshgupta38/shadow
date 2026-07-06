"""Repetitive-task routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, Provider
from app.models.enums import RepetitiveTaskStatus
from app.schemas.repetitive_task import (
    RepetitiveTaskCreate,
    RepetitiveTaskRead,
    RepetitiveTaskRecommendationRead,
    RepetitiveTaskUpdate,
)
from app.services import (
    progress_metric_recommendation_service,
    repetitive_task_service,
)

router = APIRouter(prefix="/repetitive-tasks", tags=["repetitive-tasks"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[RepetitiveTaskRead])
def list_tasks(
    db: DbSession,
    current_user: CurrentUser,
    status: RepetitiveTaskStatus | None = None,
) -> list[RepetitiveTaskRead]:
    return repetitive_task_service.list_tasks(db, current_user, status=status)


@router.get("/recommendations", response_model=list[RepetitiveTaskRecommendationRead])
def list_recommendations(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = 5,
) -> list[RepetitiveTaskRecommendationRead]:
    return repetitive_task_service.list_recommendations(db, current_user, limit=limit)


@router.post("", response_model=RepetitiveTaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    data: RepetitiveTaskCreate,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> RepetitiveTaskRead:
    task = repetitive_task_service.create_task(db, current_user, data)
    try:
        progress_metric_recommendation_service.refresh_for_habit(
            db,
            current_user,
            provider,
            habit_id=task.id,
        )
    except Exception:
        # Recommendation generation must never fail the source habit save.
        logger.exception(
            "Progress Coach recommendation refresh failed after habit create",
        )
    return task


@router.put("/{task_id}", response_model=RepetitiveTaskRead)
def update_task(
    task_id: int,
    data: RepetitiveTaskUpdate,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> RepetitiveTaskRead:
    task = repetitive_task_service.update_task(db, current_user, task_id, data)
    try:
        progress_metric_recommendation_service.refresh_for_habit(
            db,
            current_user,
            provider,
            habit_id=task.id,
        )
    except Exception:
        # Recommendation generation must never fail the source habit save.
        logger.exception(
            "Progress Coach recommendation refresh failed after habit update",
        )
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, current_user: CurrentUser) -> None:
    repetitive_task_service.delete_task(db, current_user, task_id)
