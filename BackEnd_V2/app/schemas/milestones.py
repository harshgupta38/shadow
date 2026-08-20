from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel

MilestoneStatus = Literal[
    "Not Started",
    "In Progress",
    "Paused",
    "Completed",
    "Cancelled",
]
MilestoneCreatedBy = Literal["User", "Assistant"]


class MilestoneCreateRequest(BaseModel):
    goal_id: int
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    reason: str = Field(min_length=1, max_length=2000)
    estimated_duration_days: int | None = Field(default=None)
    created_by: MilestoneCreatedBy = "User"
    assistant_context: dict[str, Any] | None = None

    @classmethod
    def _require_non_empty_text(cls, value: Any, field_label: str) -> Any:
        if value is None:
            raise ValueError(f"{field_label} is required.")

        if isinstance(value, str) and not value.strip():
            raise ValueError(f"{field_label} is required.")

        return value

    @field_validator("title", "reason", mode="before")
    @classmethod
    def validate_required_text_fields(cls, value: Any, info: Any) -> Any:
        field_labels = {
            "title": "Title",
            "reason": "Reason",
        }

        return cls._require_non_empty_text(
            value, field_labels.get(info.field_name, info.field_name)
        )

    @field_validator("estimated_duration_days")
    @classmethod
    def validate_estimated_duration_days(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("Estimated days should be greater than 0.")

        return value


class MilestoneUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    status: MilestoneStatus | None = None
    reason: str | None = Field(default=None, max_length=2000)
    estimated_duration_days: int | None = Field(default=None)
    target_date: date | None = None
    position: int | None = Field(default=None, ge=0)

    @field_validator("estimated_duration_days")
    @classmethod
    def validate_estimated_duration_days(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("Estimated days should be greater than 0")

        return value

    @field_validator("target_date")
    @classmethod
    def validate_target_date(cls, value: date | None) -> date | None:
        if value is not None and value < date.today():
            raise ValueError("Target date must be today or a future date.")

        return value


class MilestoneDataDBS(ORMModel):
    id: int
    goal_id: int
    title: str
    description: str | None
    status: MilestoneStatus

    reason: str | None
    estimated_duration_days: int | None

    started_at: datetime | None
    paused_at: datetime | None
    cancelled_at: datetime | None
    target_date: date | None
    completed_at: datetime | None

    position: int
    created_at: datetime
    created_by: MilestoneCreatedBy
    assistant_context: dict[str, Any] | None

    total_tasks: int
    completed_tasks: int


class MilestoneDataResponse(MilestoneDataDBS):
    pass


class MilestoneProposalLLMSchema(BaseModel):
    title: str = Field(
        description=(
            "A short, single-line title for the milestone. "
            "Must be concise — no more than one sentence, no line breaks, no punctuation at the end."
        )
    )
    description: str | None = Field(
        default=None,
        description=(
            "Rich text detail about what this milestone involves. "
            "Use Markdown formatting: headings (##, ###), bold (**text**), italic (*text*), "
            "bullet lists (- item), numbered lists (1. item), and code blocks (```code```) where appropriate. "
            "Write in full sentences and paragraphs. Be thorough — this is like a section in a Word document."
        ),
    )
    reason: str = Field(
        description="Why this milestone is important for achieving the goal."
    )
    estimated_duration_days: int | None = Field(
        default=None,
        description="Estimated number of days to complete this milestone. Null if unknown.",
    )
    target_date: str | None = Field(
        default=None,
        description="Estimated target date in YYYY-MM-DD format, if derivable from the goal. Null otherwise.",
    )
    assistant_context: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Structured context to support daily planning and progress reporting for this milestone. "
            "Include: key_steps (list of concrete action steps), daily_focus (what the user should work on each day), "
            "success_indicators (how to know the milestone is on track), "
            "and any other context relevant to breaking this milestone into daily work."
        ),
    )


class MilestoneProposalListLLMSchema(BaseModel):
    milestones: list[MilestoneProposalLLMSchema] = Field(
        description="An ordered list of milestone proposals, from first to last."
    )


class SaveMilestoneFromProposalRequest(BaseModel):
    proposal_id: str
    milestone: MilestoneProposalLLMSchema
