from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


TaskType = Literal["Numeric", "Binary"]
NumericTaskStatus = Literal[
    "Not Started",
    "In Progress",
    "Paused",
    "Completed",
    "Cancelled",
]
BinaryTaskStatus = Literal["Not Started", "Completed", "Cancelled"]
TaskPlanningMethod = Literal["Daily", "Weekly", "Monthly"]
TaskCreatedBy = Literal["User", "Assistant"]


class TaskCreateRequest(BaseModel):
    goal_id: int
    milestone_id: int
    title: str = Field(min_length=1, max_length=255)
    task_type: TaskType

    current_value: float | None = None
    target_value: float | None = None
    value_unit: str | None = Field(default=None, max_length=64)

    planning_enabled: bool = False
    planning_method: TaskPlanningMethod | None = None
    planner_target: float | None = None
    planning_start_date: date | None = None
    start_with_milestone: bool = False
    planning_end_date: date | None = None
    end_with_milestone: bool = False

    assistant_context: dict[str, Any] | None = None
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Title is required.")
        if isinstance(value, str) and not value.strip():
            raise ValueError("Title is required.")
        return value

    @field_validator("current_value", "target_value", "planner_target")
    @classmethod
    def validate_positive_numbers(cls, value: float | None, info: Any) -> float | None:
        if value is None:
            return value

        if info.field_name in {"target_value", "planner_target"} and value <= 0:
            raise ValueError(f"{info.field_name} must be greater than 0.")

        if info.field_name == "current_value" and value < 0:
            raise ValueError("current_value cannot be negative.")

        return value

    @model_validator(mode="after")
    def validate_task_type_rules(self) -> "TaskCreateRequest":
        if self.task_type == "Numeric":
            today = date.today()

            if self.target_value is None:
                raise ValueError("target_value is required for Numeric tasks.")

            if self.current_value is None:
                self.current_value = 0

            if self.current_value > self.target_value:
                raise ValueError("current_value cannot be greater than target_value.")

            if self.value_unit is None or not self.value_unit.strip():
                raise ValueError("value_unit is required for Numeric tasks.")

            if self.planning_enabled:
                if self.planning_method is None:
                    raise ValueError("planning_method is required when planning_enabled is true.")
                if self.planner_target is None:
                    raise ValueError("planner_target is required when planning_enabled is true.")
                if self.start_with_milestone and not self.end_with_milestone:
                    raise ValueError("end_with_milestone must be true when start_with_milestone is true.")
                if self.start_with_milestone and self.planning_start_date is not None:
                    raise ValueError("planning_start_date must be omitted when start_with_milestone is true.")
                if self.end_with_milestone and self.planning_end_date is not None:
                    raise ValueError("planning_end_date must be omitted when end_with_milestone is true.")
                if not self.start_with_milestone and self.planning_start_date is None:
                    raise ValueError("planning_start_date is required when start_with_milestone is false.")
                if (
                    not self.start_with_milestone
                    and self.planning_start_date is not None
                    and self.planning_start_date < today
                ):
                    raise ValueError("planning_start_date cannot be in the past.")
                if not self.end_with_milestone and self.planning_end_date is None:
                    raise ValueError("planning_end_date is required when end_with_milestone is false.")

                effective_start = self.planning_start_date
                effective_end = self.planning_end_date
                if effective_start is not None and effective_end is not None and effective_end < effective_start:
                    raise ValueError("planning_end_date must be on or after planning_start_date.")

        if self.task_type == "Binary":
            blocked_fields = {
                "current_value": self.current_value,
                "target_value": self.target_value,
                "value_unit": self.value_unit,
                "planning_method": self.planning_method,
                "planner_target": self.planner_target,
                "planning_start_date": self.planning_start_date,
                "planning_end_date": self.planning_end_date,
            }

            for field_name, field_value in blocked_fields.items():
                if field_value is not None:
                    raise ValueError(f"{field_name} is not allowed for Binary tasks.")

            if self.planning_enabled:
                raise ValueError("planning_enabled must be false for Binary tasks.")

            if self.start_with_milestone:
                raise ValueError("start_with_milestone must be false for Binary tasks.")

            if self.end_with_milestone:
                raise ValueError("end_with_milestone must be false for Binary tasks.")

        return self


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: NumericTaskStatus | None = None

    current_value: float | None = None
    target_value: float | None = None
    value_unit: str | None = Field(default=None, max_length=64)

    planning_enabled: bool | None = None
    planning_method: TaskPlanningMethod | None = None
    planner_target: float | None = None
    planning_start_date: date | None = None
    start_with_milestone: bool | None = None
    planning_end_date: date | None = None
    end_with_milestone: bool | None = None

    note: str | None = Field(default=None, max_length=2000)
    position: int | None = Field(default=None, ge=0)

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: Any) -> Any:
        if value is None:
            return value
        if isinstance(value, str) and not value.strip():
            raise ValueError("Title is required.")
        return value

    @field_validator("current_value", "target_value", "planner_target")
    @classmethod
    def validate_positive_numbers(cls, value: float | None, info: Any) -> float | None:
        if value is None:
            return value

        if info.field_name in {"target_value", "planner_target"} and value <= 0:
            raise ValueError(f"{info.field_name} must be greater than 0.")

        if info.field_name == "current_value" and value < 0:
            raise ValueError("current_value cannot be negative.")

        return value

    @model_validator(mode="after")
    def validate_planning_date_window(self) -> "TaskUpdateRequest":
        fields_set = self.model_fields_set

        if self.start_with_milestone is True and self.end_with_milestone is False:
            raise ValueError("end_with_milestone must be true when start_with_milestone is true.")

        if (
            self.current_value is not None
            and self.target_value is not None
            and self.current_value > self.target_value
        ):
            raise ValueError("current_value cannot be greater than target_value.")

        if self.start_with_milestone and self.planning_start_date is not None:
            raise ValueError("planning_start_date must be omitted when start_with_milestone is true.")

        if self.end_with_milestone and self.planning_end_date is not None:
            raise ValueError("planning_end_date must be omitted when end_with_milestone is true.")

        if self.planning_enabled is False:
            if self.planning_method is not None:
                raise ValueError("planning_method is not allowed when planning_enabled is false.")
            if self.planner_target is not None:
                raise ValueError("planner_target is not allowed when planning_enabled is false.")
            if self.planning_start_date is not None:
                raise ValueError("planning_start_date is not allowed when planning_enabled is false.")
            if self.planning_end_date is not None:
                raise ValueError("planning_end_date is not allowed when planning_enabled is false.")
            if self.start_with_milestone:
                raise ValueError("start_with_milestone must be false when planning_enabled is false.")
            if self.end_with_milestone:
                raise ValueError("end_with_milestone must be false when planning_enabled is false.")

        if self.planning_enabled is True:
            if (
                "start_with_milestone" in fields_set
                and self.start_with_milestone is False
                and "planning_start_date" in fields_set
                and self.planning_start_date is None
            ):
                raise ValueError("planning_start_date is required when start_with_milestone is false.")

            if (
                "end_with_milestone" in fields_set
                and self.end_with_milestone is False
                and "planning_end_date" in fields_set
                and self.planning_end_date is None
            ):
                raise ValueError("planning_end_date is required when end_with_milestone is false.")

        if (
            self.planning_start_date is not None
            and self.planning_end_date is not None
            and self.planning_end_date < self.planning_start_date
        ):
            raise ValueError("planning_end_date must be on or after planning_start_date.")

        return self


class TaskResponse(BaseModel):
    id: int
    goal_id: int
    milestone_id: int
    title: str
    task_type: TaskType

    current_value: float | None
    target_value: float | None
    value_unit: str | None

    status: NumericTaskStatus
    planning_enabled: bool
    planning_method: TaskPlanningMethod | None
    planner_target: float | None
    planning_start_date: date | None
    start_with_milestone: bool
    planning_end_date: date | None
    end_with_milestone: bool

    assistant_context: dict[str, Any] | None
    note: str | None

    position: int
    created_at: datetime
    created_by: TaskCreatedBy
    started_at: datetime | None
    paused_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
