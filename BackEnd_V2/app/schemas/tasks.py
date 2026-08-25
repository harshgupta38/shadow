from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel


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

        if self.task_type == "Binary":
            blocked_fields = {
                "current_value": self.current_value,
                "target_value": self.target_value,
                "value_unit": self.value_unit,
                "planning_method": self.planning_method,
                "planner_target": self.planner_target,
            }

            for field_name, field_value in blocked_fields.items():
                if field_value is not None:
                    raise ValueError(f"{field_name} is not allowed for Binary tasks.")

            if self.planning_enabled:
                raise ValueError("planning_enabled must be false for Binary tasks.")

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
    def validate_planning_fields(self) -> "TaskUpdateRequest":
        if (
            self.current_value is not None
            and self.target_value is not None
            and self.current_value > self.target_value
        ):
            raise ValueError("current_value cannot be greater than target_value.")

        if self.planning_enabled is False:
            if self.planning_method is not None:
                raise ValueError("planning_method is not allowed when planning_enabled is false.")
            if self.planner_target is not None:
                raise ValueError("planner_target is not allowed when planning_enabled is false.")

        return self


class TaskDataDBS(ORMModel):
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

    assistant_context: dict[str, Any] | None
    note: str | None

    position: int
    created_at: datetime
    created_by: TaskCreatedBy
    started_at: datetime | None
    paused_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None


class TaskDataResponse(TaskDataDBS):
    pass


# --- TASK PROPOSALS (Assistant flow) ---

class TaskProposalLLMSchema(BaseModel):
    title: str = Field(
        description=(
            "A short, action-oriented title (e.g. 'Complete 50 LeetCode medium problems'). "
            "No trailing punctuation, no line breaks."
        )
    )
    task_type: TaskType = Field(
        description=(
            "Use 'Numeric' when progress can be counted (e.g. problems solved, pages read, hours logged). "
            "Use 'Binary' for done/not-done deliverables (e.g. submit an application, finish a course)."
        )
    )
    target_value: float | None = Field(
        default=None,
        description=(
            "Required for Numeric tasks. A realistic positive target number the user is working toward "
            "(e.g. 50 for '50 problems'). Null for Binary tasks."
        ),
    )
    value_unit: str | None = Field(
        default=None,
        description=(
            "Required for Numeric tasks. A short noun describing what is counted "
            "(e.g. 'problems', 'pages', 'hours', 'chapters'). Null for Binary tasks."
        ),
    )
    note: str | None = Field(
        default=None,
        max_length=500,
        description=(
            "One sentence of non-obvious guidance visible to the user — a dependency, prerequisite, or pitfall. "
            "Null if there is nothing genuinely worth highlighting."
        ),
    )
    assistant_context: str = Field(
        description=(
            "Always populate. 2–4 sentences of internal coaching context for daily planning: "
            "the key steps, a suggested daily or weekly pace, and what success looks like for this task. "
            "Not shown to the user."
        ),
    )

    @model_validator(mode="after")
    def validate_numeric_fields(self) -> "TaskProposalLLMSchema":
        if self.task_type == "Numeric":
            if self.target_value is None:
                raise ValueError("target_value is required for Numeric tasks.")
            if self.target_value <= 0:
                raise ValueError("target_value must be greater than 0.")
            if not self.value_unit or not self.value_unit.strip():
                raise ValueError("value_unit is required for Numeric tasks.")
        else:
            if self.target_value is not None:
                raise ValueError("target_value must be null for Binary tasks.")
            if self.value_unit is not None:
                raise ValueError("value_unit must be null for Binary tasks.")
        return self


class TaskProposalListLLMSchema(BaseModel):
    tasks: list[TaskProposalLLMSchema] = Field(
        description="An ordered list of task proposals."
    )


class SaveTaskFromProposalRequest(BaseModel):
    proposal_id: str
    task: TaskCreateRequest
