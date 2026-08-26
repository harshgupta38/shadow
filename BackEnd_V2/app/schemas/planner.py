from typing import Literal

from pydantic import BaseModel


PlanSourceType = Literal["habit", "task"]
PlannerType = Literal["simple", "metric"]
PlanPriority = Literal["highest", "high", "medium", "low", "lowest"]
PlanPreferredTime = Literal["flexible", "morning", "afternoon", "evening", "night", "custom"]
PlanStatus = Literal["due", "done", "missed"]


class DailyPlanItemResponse(BaseModel):
    plan_id: int
    source_type: PlanSourceType
    source_id: int
    title: str
    planner_type: PlannerType
    # Always 1 for simple plans; user-specified for metric.
    planner_target: int | None
    value_unit: str | None
    priority: PlanPriority
    preferred_time: PlanPreferredTime
    specific_time: str | None
    duration_minutes: int | None
    # Additional field to indicate the status of the plan for the given date.
    status: PlanStatus


class DailyPlanResponse(BaseModel):
    items: list[DailyPlanItemResponse]
    missed_yesterday_count: int
    carry_forward_count: int
    workload_label: str
