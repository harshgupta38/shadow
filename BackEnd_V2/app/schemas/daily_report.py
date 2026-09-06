from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── LLM output schema (structured output contract with the model) ─────────────

class GoalAlignmentSchema(BaseModel):
    goal_id: int = Field(description="Goal ID exactly as provided in the input data")
    alignment_pct: int = Field(description="0–100: how well today's completed tasks aligned with this goal")
    note: str = Field(description="1–2 sentence honest assessment of progress on this goal")


class GenerateReportSchema(BaseModel):
    alignment_score: int = Field(description="Overall alignment score 0–100 across all goals and habits")
    headline: str = Field(description="Single punchy headline summarising the day/week, under 100 characters")
    summary: str = Field(description="2–3 sentence narrative: honest, specific, and constructive")
    goals: list[GoalAlignmentSchema] = Field(description="One entry per active goal that has planned work today")
    highlights_good: list[str] = Field(description="2–4 concrete things that went well")
    highlights_attention: list[str] = Field(description="1–3 specific things that slipped or need attention")
    closing_tone: Literal["motivate", "guide", "celebrate"] = Field(
        description="celebrate if score >= 80, motivate if score < 40, guide otherwise"
    )
    closing_message: str = Field(description="1–2 sentence closing note matching the tone")


# ── API response schemas (returned to the frontend) ───────────────────────────

class GoalAlignmentResponse(BaseModel):
    id: int
    title: str
    alignment_pct: int
    milestone_title: str
    note: str
    tasks_done: int
    tasks_total: int


class ReportStatsResponse(BaseModel):
    tasks_done: int
    tasks_total: int
    habits_done: int
    habits_total: int
    best_streak: int


class ReportHighlightsResponse(BaseModel):
    good: list[str]
    attention: list[str]


class ReportClosingResponse(BaseModel):
    tone: Literal["motivate", "guide", "celebrate"]
    message: str


class ReportResponse(BaseModel):
    date: date
    report_type: str
    generated_at: datetime
    alignment_score: int
    headline: str
    summary: str
    stats: ReportStatsResponse
    goals: list[GoalAlignmentResponse]
    highlights: ReportHighlightsResponse
    closing: ReportClosingResponse

    model_config = {"from_attributes": True}
