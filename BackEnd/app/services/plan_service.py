"""Planned-task business logic (daily/weekly plan → planned-vs-done)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.enums import PlannedTaskStatus
from app.models.planned_task import PlannedTask
from app.models.user import User
from app.schemas.plan import PlannedTaskCreate, PlannedTaskUpdate
from app.services.utils import get_owned_or_404


def list_tasks(db: Session, user: User, *, on_date: date | None = None) -> list[PlannedTask]:
    stmt = select(PlannedTask).where(PlannedTask.user_id == user.id)
    if on_date is not None:
        stmt = stmt.where(PlannedTask.date == on_date)
    return list(db.scalars(stmt.order_by(PlannedTask.date.desc(), PlannedTask.id)))


def create_task(db: Session, user: User, data: PlannedTaskCreate) -> PlannedTask:
    task = PlannedTask(
        user_id=user.id,
        title=data.title,
        date=data.date or date.today(),
        related_goal_id=data.related_goal_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_task(db: Session, user: User, task_id: int, data: PlannedTaskUpdate) -> PlannedTask:
    task = get_owned_or_404(db, PlannedTask, task_id, user.id, name="Task")
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(task, field, value)
    if "status" in updates:
        if task.status == PlannedTaskStatus.done and task.completed_at is None:
            task.completed_at = utcnow()
        elif task.status != PlannedTaskStatus.done:
            task.completed_at = None
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, user: User, task_id: int) -> None:
    task = get_owned_or_404(db, PlannedTask, task_id, user.id, name="Task")
    db.delete(task)
    db.commit()


def upcoming_tasks(db: Session, user: User, *, limit: int = 5) -> list[PlannedTask]:
    today = date.today()
    return list(
        db.scalars(
            select(PlannedTask)
            .where(
                PlannedTask.user_id == user.id,
                PlannedTask.date >= today,
                PlannedTask.status == PlannedTaskStatus.planned,
            )
            .order_by(PlannedTask.date, PlannedTask.id)
            .limit(limit)
        )
    )
