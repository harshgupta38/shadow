"""Planned-task routes."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, Provider
from app.schemas.plan import (
    PlanGenerateRequest,
    PlanScheduleDraftRead,
    PlanScheduleDraftRequest,
    PlanWorkspaceRead,
    PlannedTaskCreate,
    PlannedTaskProgressUpdate,
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


@router.get("/schedule", response_model=list[PlannedTaskRead])
def list_scheduled_tasks(
    db: DbSession,
    current_user: CurrentUser,
    from_date: date | None = None,
) -> list[PlannedTaskRead]:
    return plan_service.list_scheduled_tasks(db, current_user, from_date=from_date)


@router.post("/schedule/draft", response_model=PlanScheduleDraftRead)
def draft_scheduled_task(
    data: PlanScheduleDraftRequest,
    db: DbSession,
    current_user: CurrentUser,
    provider: Provider,
) -> PlanScheduleDraftRead:
    return plan_service.draft_scheduled_task_from_prompt(
        db,
        current_user,
        provider,
        prompt=data.prompt,
        on_date=data.on_date,
    )


@router.post("/schedule", response_model=PlannedTaskRead, status_code=status.HTTP_201_CREATED)
def create_scheduled_task(
    data: PlannedTaskCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> PlannedTaskRead:
    return plan_service.create_scheduled_task(db, current_user, data)


@router.put("/schedule/{task_id}", response_model=PlannedTaskRead)
def update_scheduled_task(
    task_id: int,
    data: PlannedTaskUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> PlannedTaskRead:
    return plan_service.update_scheduled_task(db, current_user, task_id, data)


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


@router.post("/{task_id}/progress", response_model=PlanWorkspaceRead)
def log_task_progress(
    task_id: int,
    data: PlannedTaskProgressUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> PlanWorkspaceRead:
    return plan_service.log_task_progress(db, current_user, task_id, data)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DbSession, current_user: CurrentUser) -> None:
    plan_service.delete_task(db, current_user, task_id)
