from pydantic import BaseModel, Field, field_validator
from typing import Any, List, Literal


class UnderstandGoalRequest(BaseModel):
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


class Milestone(BaseModel):
    title: str = Field(description="Short milestone title")
    description: str = Field(description="Brief explanation of the milestone")


class UnderstandGoalResponse(BaseModel):
    # Goal Summary
    title: str = Field(description="A concise title for the user's goal.")
    summary: str = Field(description="A one-paragraph summary of the goal.")

    # Goal Classification
    category: Literal[
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
    ] = Field(description="The most appropriate category for the goal.")

    goal_type: Literal[
        "Outcome Goal",
        "Habit Goal",
        "Skill Goal",
        "Project Goal",
        "Milestone Goal",
    ] = Field(description="The type of goal.")

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
    estimated_duration: str = Field(
        description="Estimated time required to achieve the goal."
    )

    difficulty: Literal["Easy", "Medium", "Hard", "Expert"] = Field(
        description="Estimated difficulty level."
    )

    success_metrics: List[str] = Field(
        description="Specific measurable indicators of success."
    )

    milestones: List[Milestone] = Field(
        description="High-level milestones to achieve the goal."
    )

    # AI Insights
    insights: List[str] = Field(
        description="Important coaching insights about the user's goal."
    )
