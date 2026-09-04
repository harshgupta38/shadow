from typing import Literal

from pydantic import BaseModel

from app.schemas.goals import CategoryType
from app.schemas.habits import HabitPriority, HabitType

ColorKey = Literal["success", "info", "brand", "warn", "violet"]


class EligibleHabitItem(BaseModel):
    id: int
    title: str
    category: CategoryType | None
    priority: HabitPriority
    planner_type: HabitType


class HabitTrackItem(BaseModel):
    id: int
    title: str
    category: CategoryType | None
    planner_type: HabitType
    planner_target: int | None
    value_unit: str | None
    
    current_streak: int
    max_streak: int
    # 7 entries — index 0 = Sunday, index 6 = Saturday of the current week.
    # Simple habits: 1 if done, 0 otherwise.
    # Metric habits: actual_value if done, 0 otherwise. Future days are 0.
    history: list[int]
    done_today: bool
    current_value: int  # today's actual_value (0 if not logged yet)
    color: ColorKey


