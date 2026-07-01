"""Planned-task routes."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.plan import PlannedTaskCreate, PlannedTaskRead, PlannedTaskUpdate
from app.services import plan_service

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("", response_model=list[PlannedTaskRead])
def list_tasks(
    db: DbSession, current_user: CurrentUser, on_date: date | None = None
) -> list[PlannedTaskRead]:
    return plan_service.list_tasks(db, current_user, on_date=on_date)


@router.post("", response_model=PlannedTaskRead, status_code=status.HTTP_201_CREATED)
def create_task(data: PlannedTaskCreate, db: DbSession, current_user: CurrentUser) -> PlannedTaskRead:
    return plan_service.create_task(db, current_user, data)


@router.put("/{task_id}", response_model=PlannedTaskRead)
def update_task(
    task_id: int, data: PlannedTaskUpdate, db: DbSession, current_user: CurrentUser
) -> PlannedTaskRead:
    return plan_service.update_task(db, current_user, task_id, data)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, current_user: CurrentUser) -> None:
    plan_service.delete_task(db, current_user, task_id)
