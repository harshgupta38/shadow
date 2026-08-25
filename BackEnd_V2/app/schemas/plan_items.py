from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import ORMModel

PlanItemStatus = Literal["planned", "done", "missed"]
PlanItemPriority = Literal["highest", "high", "medium", "low", "lowest"]
WorkloadLabel = Literal["Light", "Moderate", "Heavy"]


class PlanDataDBS(ORMModel):
    id: int
    source_type: str
    source_id: int

    title: str
    description: str | None

    scheduled_date: date
    scheduled_time: str | None
    duration_minutes: int | None

    priority: PlanItemPriority
    status: PlanItemStatus

    habit_type: str | None
    target_value: int | None
    target_unit: str
    time_span: str
    
    linked_items: dict


class PlanDataResponse(PlanDataDBS):
    pass


class TodayPlanResponse(BaseModel):
    date: date
    items: list[PlanDataResponse]
    missed_yesterday_count: int
    carry_forward_count: int
    workload_label: WorkloadLabel


class PlanStatusUpdateRequest(BaseModel):
    status: PlanItemStatus
