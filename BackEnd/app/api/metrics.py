"""Metric & activity-log routes."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.activity import ActivityLogCreate, ActivityLogRead
from app.schemas.metric import MetricCreate, MetricRead, MetricUpdate
from app.services import metric_service

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=list[MetricRead])
def list_metrics(
    db: DbSession, current_user: CurrentUser, include_inactive: bool = False
) -> list[MetricRead]:
    return metric_service.list_metrics(db, current_user, include_inactive=include_inactive)


@router.post("", response_model=MetricRead, status_code=status.HTTP_201_CREATED)
def create_metric(data: MetricCreate, db: DbSession, current_user: CurrentUser) -> MetricRead:
    return metric_service.create_metric(db, current_user, data)


@router.put("/{metric_id}", response_model=MetricRead)
def update_metric(
    metric_id: int, data: MetricUpdate, db: DbSession, current_user: CurrentUser
) -> MetricRead:
    return metric_service.update_metric(db, current_user, metric_id, data)


@router.delete("/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_metric(metric_id: int, db: DbSession, current_user: CurrentUser) -> None:
    metric_service.delete_metric(db, current_user, metric_id)


@router.get("/{metric_id}/logs", response_model=list[ActivityLogRead])
def list_logs(metric_id: int, db: DbSession, current_user: CurrentUser) -> list[ActivityLogRead]:
    return metric_service.list_logs(db, current_user, metric_id)


@router.post(
    "/{metric_id}/logs",
    response_model=ActivityLogRead,
    status_code=status.HTTP_201_CREATED,
)
def add_log(
    metric_id: int, data: ActivityLogCreate, db: DbSession, current_user: CurrentUser
) -> ActivityLogRead:
    return metric_service.add_log(db, current_user, metric_id, data)
