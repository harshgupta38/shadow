"""Chat schemas."""

from __future__ import annotations

import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.models.enums import (
    AgentType,
    AssistantActionConfidence,
    AssistantActionModule,
    ChatRole,
    MetricUnit,
    RepetitiveTaskPriority,
)
from app.schemas.common import ORMModel
from app.schemas.milestone import MilestoneDetail
from app.schemas.repetitive_task import RepetitiveTaskFrequency


class ChatSessionCreate(BaseModel):
    agent_type: AgentType = AgentType.general
    title: str = Field(default="New chat", max_length=255)
    goal_id: int | None = Field(default=None, ge=1)


class ChatSessionRead(ORMModel):
    id: int
    agent_type: AgentType
    title: str
    goal_id: int | None
    created_at: datetime.datetime
    updated_at: datetime.datetime


class ChatMessageRead(ORMModel):
    id: int
    session_id: int
    role: ChatRole
    content: str
    agent_type: AgentType
    created_at: datetime.datetime


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1)
    fresh_intake_mode: bool = False


class PlanCreateTaskArgs(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    date: datetime.date | None = None
    related_goal_id: int | None = None
    reminder_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    estimated_duration_minutes: int | None = Field(default=None, ge=5, le=360)


class GoalsCreateGoalArgs(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=64)
    target_date: datetime.datetime | None = None


class GoalsAddMilestoneArgs(BaseModel):
    goal_id: int
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    details: list[MilestoneDetail] | None = None
    order: int = 0
    due_date: datetime.datetime | None = None


class TrackCreateMetricArgs(BaseModel):
    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=128)
    unit: MetricUnit = MetricUnit.count
    target: int | None = Field(default=None, ge=0)


class TrackLogMetricArgs(BaseModel):
    key: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")
    value: float
    date: datetime.date | None = None
    note: str | None = None


class RepetitiveTasksCreateTaskArgs(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    frequencies: list[RepetitiveTaskFrequency] = Field(min_length=1, max_length=14)
    priority: RepetitiveTaskPriority = RepetitiveTaskPriority.medium
    linked_goal_ids: list[int] = Field(default_factory=list)
    linked_metric_ids: list[int] = Field(default_factory=list)


class AssistantProposedActionBase(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    module: AssistantActionModule
    type: str
    title: str = Field(min_length=1, max_length=120)
    rationale: str = Field(default="", max_length=280)
    confidence: AssistantActionConfidence = AssistantActionConfidence.medium
    requires_confirmation: bool = True
    destructive: bool = False


class PlanCreateTaskAction(AssistantProposedActionBase):
    module: Literal[AssistantActionModule.plan] = AssistantActionModule.plan
    type: Literal["plan.create_task"] = "plan.create_task"
    args: PlanCreateTaskArgs


class GoalsCreateGoalAction(AssistantProposedActionBase):
    module: Literal[AssistantActionModule.goals] = AssistantActionModule.goals
    type: Literal["goals.create_goal"] = "goals.create_goal"
    args: GoalsCreateGoalArgs


class GoalsAddMilestoneAction(AssistantProposedActionBase):
    module: Literal[AssistantActionModule.goals] = AssistantActionModule.goals
    type: Literal["goals.add_milestone"] = "goals.add_milestone"
    args: GoalsAddMilestoneArgs


class TrackCreateMetricAction(AssistantProposedActionBase):
    module: Literal[AssistantActionModule.track] = AssistantActionModule.track
    type: Literal["track.create_metric"] = "track.create_metric"
    args: TrackCreateMetricArgs


class TrackLogMetricAction(AssistantProposedActionBase):
    module: Literal[AssistantActionModule.track] = AssistantActionModule.track
    type: Literal["track.log_metric"] = "track.log_metric"
    args: TrackLogMetricArgs


class RepetitiveTasksCreateTaskAction(AssistantProposedActionBase):
    module: Literal[AssistantActionModule.repetitive_tasks] = (
        AssistantActionModule.repetitive_tasks
    )
    type: Literal["repetitive_tasks.create_task"] = "repetitive_tasks.create_task"
    args: RepetitiveTasksCreateTaskArgs


AssistantProposedAction = Annotated[
    PlanCreateTaskAction
    | GoalsCreateGoalAction
    | GoalsAddMilestoneAction
    | TrackCreateMetricAction
    | TrackLogMetricAction
    | RepetitiveTasksCreateTaskAction,
    Field(discriminator="type"),
]


class ChatActionExecuteRequest(BaseModel):
    action: AssistantProposedAction
    confirmed: bool = False


class ChatActionExecuteResponse(BaseModel):
    status: Literal["executed", "rejected", "failed"]
    message: str
    action: AssistantProposedAction
    link: str | None = None
    entity_id: int | None = None


class ChatSendResponse(BaseModel):
    """A user message and the assistant reply it produced."""

    user_message: ChatMessageRead
    assistant_message: ChatMessageRead
    session: ChatSessionRead
    proposed_actions: list[AssistantProposedAction] = Field(default_factory=list)
