"""Planned-task routes."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, Provider
from app.schemas.plan import (
    PlanGenerateRequest,
    PlanWorkspaceRead,
    PlannedTaskCreate,
    PlannedTaskRead,
    PlannedTaskUpdate,
)
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


@router.get("/workspace", response_model=PlanWorkspaceRead)
def workspace(
    db: DbSession,
    current_user: CurrentUser,
    on_date: date | None = None,
) -> PlanWorkspaceRead:
    return plan_service.workspace_for_date(db, current_user, on_date=on_date)


@router.post("/generate-today", response_model=PlanWorkspaceRead)
def generate_today(
    data: PlanGenerateRequest,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> PlanWorkspaceRead:
    return plan_service.generate_today_plan(
        db,
        current_user,
        provider,
        on_date=data.on_date,
    )


@router.put("/{task_id}", response_model=PlannedTaskRead)
def update_task(
    task_id: int, data: PlannedTaskUpdate, db: DbSession, current_user: CurrentUser
) -> PlannedTaskRead:
    return plan_service.update_task(db, current_user, task_id, data)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, current_user: CurrentUser) -> None:
    plan_service.delete_task(db, current_user, task_id)
