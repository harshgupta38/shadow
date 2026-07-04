"""Repetitive-task routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.models.enums import RepetitiveTaskStatus
from app.schemas.repetitive_task import (
    RepetitiveTaskCreate,
    RepetitiveTaskRead,
    RepetitiveTaskRecommendationRead,
    RepetitiveTaskUpdate,
)
from app.services import repetitive_task_service

router = APIRouter(prefix="/repetitive-tasks", tags=["repetitive-tasks"])


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
) -> RepetitiveTaskRead:
    return repetitive_task_service.create_task(db, current_user, data)


@router.put("/{task_id}", response_model=RepetitiveTaskRead)
def update_task(
    task_id: int,
    data: RepetitiveTaskUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> RepetitiveTaskRead:
    return repetitive_task_service.update_task(db, current_user, task_id, data)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, current_user: CurrentUser) -> None:
    repetitive_task_service.delete_task(db, current_user, task_id)
