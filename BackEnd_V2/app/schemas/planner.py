from typing import Literal

from pydantic import BaseModel


PlanSourceType = Literal["habit", "task"]
PlannerType = Literal["simple", "metric"]
PlanPriority = Literal["highest", "high", "medium", "low", "lowest"]
PlanPreferredTime = Literal["flexible", "morning", "afternoon", "evening", "night", "custom"]


class DailyPlanItemResponse(BaseModel):
    plan_id: int
    source_type: PlanSourceType
    source_id: int
    title: str
    planner_type: PlannerType
    # Always 1.0 for simple plans; user-specified for metric.
    planner_target: int | None
    value_unit: str | None
    priority: PlanPriority
    preferred_time: PlanPreferredTime
    specific_time: str | None
    duration_minutes: int | None
