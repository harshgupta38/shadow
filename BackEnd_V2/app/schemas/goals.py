from datetime import date
from pydantic import BaseModel, Field, field_validator
from typing import Any, List, Literal

from app.schemas.common import ORMModel

GoalStatus = Literal["Active", "Paused", "Completed"]
GoalListStatusFilter = Literal["All", "Active", "Paused", "Completed"]
GoalProposalStatus = Literal["pending", "saved"]
CategoryType = Literal[
    "Career",
    "Business",
    "Finance",
    "Health",
    "Fitness",
    "Education",
    "Relationships",
    "Productivity",
    "Personal Growth",
    "Travel",
    "Other",
]


class RefineGoalRequest(BaseModel):
    """Raw user inputs captured from the 5-step goal discovery wizard."""

    goal: str = Field(
        min_length=1,
        max_length=2000,
        description="What the user wants to achieve in plain language.",
    )
    why: str = Field(
        min_length=1,
        max_length=2000,
        description="Why this goal is important to the user.",
    )
    success: str = Field(
        min_length=1,
        max_length=2000,
        description="How the user defines success for this goal.",
    )
    reality: str = Field(
        min_length=1,
        max_length=2000,
        description="The user's current situation related to the goal.",
    )
    obstacles: str = Field(
        min_length=1,
        max_length=2000,
        description="The main blocker or challenge currently stopping progress.",
    )

    @field_validator("goal", mode="before")
    @classmethod
    def validate_goal(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Please describe what you want to achieve.")
        return value

    @field_validator("why", mode="before")
    @classmethod
    def validate_why(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Please tell us why this goal matters to you.")
        return value

    @field_validator("success", mode="before")
    @classmethod
    def validate_success(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Please define what success looks like.")
        return value

    @field_validator("reality", mode="before")
    @classmethod
    def validate_reality(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Please describe your current situation.")
        return value

    @field_validator("obstacles", mode="before")
    @classmethod
    def validate_obstacles(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            raise ValueError("Please share the main challenge blocking progress.")
        return value


class RefineGoalFromLLMSchema(BaseModel):
    # Goal Summary
    title: str = Field(description="A concise title for the user's goal.")
    summary: str = Field(description="A one-paragraph summary of the goal.")

    # Goal Classification
    category: CategoryType = Field(description="The most appropriate category for the goal.")

    # Goal Analysis
    motivation: str = Field(
        description="The underlying motivation inferred from the user's answers."
    )

    success_definition: str = Field(
        description="A clear and measurable definition of success."
    )

    current_state: str = Field(description="A summary of the user's current situation.")

    challenges: List[str] = Field(
        description="The key obstacles preventing the user from achieving the goal."
    )

    strengths: List[str] = Field(
        description="Strengths or advantages the user already has."
    )

    # Planning
    target_date: str = Field(
        description="The target completion date for the goal in YYYY-MM-DD format."
    )

    success_metrics: List[str] = Field(
        description="Specific measurable indicators of success."
    )

    # AI Insights
    insights: List[str] = Field(
        description="Important coaching insights about the user's goal."
    )

    @field_validator(
        "title",
        "summary",
        "category",
        "motivation",
        "success_definition",
        "current_state",
        "target_date",
        mode="before",
    )
    @classmethod
    def validate_required_text_fields(cls, value: Any, info: Any) -> Any:
        field_labels = {
            "title": "Title",
            "summary": "Summary",
            "category": "Category",
            "motivation": "Motivation",
            "success_definition": "Success definition",
            "current_state": "Current state",
            "target_date": "Target date",
        }

        field_name = info.field_name
        field_label = field_labels.get(field_name, field_name)

        if value is None:
            raise ValueError(f"{field_label} is required.")

        if isinstance(value, str) and not value.strip():
            raise ValueError(f"{field_label} is required.")

        return value

    @field_validator("target_date")
    @classmethod
    def validate_target_date_must_be_future(cls, value: str) -> str:
        try:
            parsed_target_date = date.fromisoformat(value.strip())
        except ValueError as exc:
            raise ValueError("Target date must be in YYYY-MM-DD format.") from exc

        if parsed_target_date <= date.today():
            raise ValueError("Target date must be a future date.")

        return parsed_target_date.isoformat()

    @field_validator(
        "challenges",
        "strengths",
        "success_metrics",
        "insights",
        mode="before",
    )
    @classmethod
    def validate_required_string_lists(cls, value: Any, info: Any) -> Any:
        field_labels = {
            "challenges": "Challenges",
            "strengths": "Strengths",
            "success_metrics": "Success metrics",
            "insights": "Insights",
        }

        field_name = info.field_name
        field_label = field_labels.get(field_name, field_name)

        if value is None:
            raise ValueError(f"{field_label} must include at least one item.")

        if not isinstance(value, list):
            raise ValueError(f"{field_label} must be a list of strings.")

        if len(value) == 0:
            raise ValueError(f"{field_label} must include at least one item.")

        has_non_empty_string = any(
            isinstance(item, str) and item.strip() for item in value
        )

        if not has_non_empty_string:
            raise ValueError(
                f"{field_label} must include at least one non-empty string."
            )

        return value


class SaveGoalRequest(RefineGoalFromLLMSchema):
    pass


class SaveGoalFromProposalRequest(BaseModel):
    """Save a goal that was previously generated as a proposal_id + user-edited goal data."""

    proposal_id: str = Field(min_length=1)
    goal: RefineGoalFromLLMSchema


class GoalDataShortDBS(ORMModel):
    id: int
    title: str
    summary: str
    category: str
    status: GoalStatus
    target_date: date
    milestones_total: int
    milestones_completed: int
    habits_total: int
    habits_active: int


class GoalDataShortResponse(GoalDataShortDBS):
    pass


class GoalDataLongDBS(GoalDataShortDBS):
    motivation: str
    success_definition: str
    current_state: str
    challenges: list[str]
    strengths: list[str]
    success_metrics: list[str]
    insights: list[str]
    source_conversation_id: int | None


class GoalDataResponse(GoalDataLongDBS):
    pass
