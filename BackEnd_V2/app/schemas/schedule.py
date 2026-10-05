from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.common import today_ist
from app.schemas.common import ORMModel
from app.schemas.goals import CategoryType

ScheduledTaskType = Literal["simple", "metric"]
ScheduledTaskPriority = Literal["highest", "high", "medium", "low", "lowest"]
ScheduledTaskPreferredTime = Literal["flexible", "morning", "afternoon", "evening", "night", "custom"]
ScheduledTaskStatus = Literal["upcoming", "completed", "snoozed", "missed"]
ScheduledTaskDuration = Literal["short", "long"]
ScheduledTaskPlannerDisplay = Literal["task", "banner", "none"]


class GoalSummary(BaseModel):
    id: int
    title: str
    category: CategoryType | None


class ScheduledTaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    planner_type: ScheduledTaskType = "simple"
    planner_target: int | None = Field(default=None, gt=0)
    value_unit: str | None = Field(default=None, max_length=64)

    priority: ScheduledTaskPriority = "medium"
    scheduled_date: date

    preferred_time: ScheduledTaskPreferredTime = "flexible"
    specific_time: str | None = Field(default=None, max_length=10)

    task_duration: ScheduledTaskDuration = "short"
    end_date: date | None = None
    end_preferred_time: ScheduledTaskPreferredTime | None = None
    end_specific_time: str | None = Field(default=None, max_length=10)
    planner_display: ScheduledTaskPlannerDisplay | None = None

    allow_snoozing: bool = False
    snooze_limit: int | None = Field(default=None, gt=0)

    duration_minutes: int | None = Field(default=None, ge=1)
    note: str | None = Field(default=None, max_length=2000)

    category: CategoryType | None = Field(default=None)
    goal_id: int | None = None
    repeat_yearly: bool = False

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Task title is required.")
        return value

    @model_validator(mode="after")
    def validate_fields(self) -> "ScheduledTaskCreateRequest":
        # For yearly tasks, any date is valid — only month + day are stored.
        if not self.repeat_yearly and self.scheduled_date < today_ist():
            raise ValueError("scheduled_date cannot be in the past.")

        if self.preferred_time == "custom":
            if not (self.specific_time and self.specific_time.strip()):
                raise ValueError("A specific time is required when 'Custom time' is selected.")
        else:
            self.specific_time = None

        if self.task_duration == "long":
            # Long-term tasks cannot recur yearly (they have an explicit end_date instead).
            self.repeat_yearly = False
            if self.end_date is None:
                raise ValueError("end_date is required for long-term tasks.")
            if self.end_date <= self.scheduled_date:
                raise ValueError("end_date must be after scheduled_date.")
            if not self.category:
                raise ValueError("category is required for long-term tasks.")
            if self.planner_display is None:
                self.planner_display = "banner"
            if self.end_preferred_time == "custom":
                if not (self.end_specific_time and self.end_specific_time.strip()):
                    raise ValueError("end_specific_time is required when end_preferred_time is 'custom'.")
            else:
                self.end_specific_time = None
        else:
            # Clear long-term fields for short tasks.
            self.end_date = None
            self.end_preferred_time = None
            self.end_specific_time = None
            self.planner_display = None

        if self.planner_type == "metric":
            if self.planner_target is None:
                raise ValueError("planner_target is required for metric tasks.")
        else:
            self.planner_target = None
            self.value_unit = None

        if not self.allow_snoozing:
            self.snooze_limit = None

        return self


# Update schema intentionally has no cross-field model_validator.
# Cross-field rules that depend on existing DB state (e.g. whether the final
# planner_type is metric) are enforced in schedule_service.update_task after
# merging the incoming fields with the loaded ScheduledTaskDBM object.
class ScheduledTaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    planner_type: ScheduledTaskType | None = None
    planner_target: int | None = Field(default=None, gt=0)
    value_unit: str | None = Field(default=None, max_length=64)

    priority: ScheduledTaskPriority | None = None
    scheduled_date: date | None = None

    preferred_time: ScheduledTaskPreferredTime | None = None
    specific_time: str | None = Field(default=None, max_length=10)

    task_duration: ScheduledTaskDuration | None = None
    end_date: date | None = None
    end_preferred_time: ScheduledTaskPreferredTime | None = None
    end_specific_time: str | None = Field(default=None, max_length=10)
    planner_display: ScheduledTaskPlannerDisplay | None = None

    allow_snoozing: bool | None = None
    snooze_limit: int | None = Field(default=None, gt=0)

    duration_minutes: int | None = Field(default=None, ge=1)
    note: str | None = Field(default=None, max_length=2000)

    category: CategoryType | None = Field(default=None)
    goal_id: int | None = None
    repeat_yearly: bool | None = None

    @model_validator(mode="after")
    def validate_scheduled_date(self) -> "ScheduledTaskUpdateRequest":
        # Mirror the create rule: yearly tasks store only month+day, so past dates are valid.
        if self.scheduled_date is not None and self.repeat_yearly is not True:
            if self.scheduled_date < today_ist():
                raise ValueError("scheduled_date cannot be in the past.")
        return self


class ScheduledTaskProposalLLMSchema(BaseModel):
    title: str
    scheduled_date: str
    priority: ScheduledTaskPriority
    planner_type: ScheduledTaskType
    planner_target: int | None
    value_unit: str | None
    preferred_time: ScheduledTaskPreferredTime
    specific_time: str | None
    allow_snoozing: bool
    snooze_limit: int | None
    duration_minutes: int | None
    note: str | None
    category: str | None = None
    goal_id: int | None = None
    assistant_context: str


class SaveScheduledTaskFromProposalRequest(BaseModel):
    proposal_id: str
    task: ScheduledTaskCreateRequest


class ScheduledTaskDataResponse(ORMModel):
    id: int
    title: str
    note: str | None
    subtasks: list["SubtaskResponse"] = []

    planner_type: ScheduledTaskType
    planner_target: int | None
    value_unit: str | None

    priority: ScheduledTaskPriority
    scheduled_date: date

    preferred_time: ScheduledTaskPreferredTime
    specific_time: str | None

    task_duration: ScheduledTaskDuration = "short"
    end_date: date | None = None
    end_preferred_time: ScheduledTaskPreferredTime | None = None
    end_specific_time: str | None = None
    planner_display: ScheduledTaskPlannerDisplay | None = None

    allow_snoozing: bool
    snooze_limit: int | None

    duration_minutes: int | None
    repeat_yearly: bool = False

    category: CategoryType | None
    goal: GoalSummary | None = None

    status: ScheduledTaskStatus

    created_at: datetime
    updated_at: datetime


# ── Sub-tasks ─────────────────────────────────────────────────────────────────

SubtaskPlannerMode = Literal["task", "highlight"]


class SubtaskCreateRequest(BaseModel):
    subtask_date: date
    description: str = Field(min_length=1, max_length=200)
    planner_mode: SubtaskPlannerMode | None = None


class SubtaskUpdateRequest(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=200)
    planner_mode: SubtaskPlannerMode | None = None


class SubtaskResponse(ORMModel):
    id: int
    task_id: int
    subtask_date: date
    description: str
    planner_mode: SubtaskPlannerMode | None
    created_at: datetime
    updated_at: datetime
