from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


# ── LLM output schema (structured output contract with the model) ─────────────

class GoalAlignmentSchema(BaseModel):
    goal_id: int = Field(description="Goal ID exactly as provided in the input data")
    alignment_pct: int = Field(description="0–100: priority-weighted completion of this goal's planned work today")
    note: str = Field(description="1 sentence: what this goal's activity means for its trajectory or success definition. Do NOT restate which items were done or missed — the user already sees that data.")


class GenerateReportSchema(BaseModel):
    alignment_score: int = Field(description="Overall alignment score 0–100 across all goals and habits")
    headline: str = Field(description="Single punchy sentence under 100 characters capturing the dominant theme")
    summary: str = Field(description="2–3 sentence narrative. Analyse, do not restate facts already visible in the data.")
    goals: list[GoalAlignmentSchema] = Field(description="One entry per active goal in the input")
    highlights_good: list[str] = Field(description="2–4 specific achievements or positive patterns, not activity titles")
    highlights_attention: list[str] = Field(description="1–3 specific gaps that genuinely matter")
    closing_message: str = Field(description="1–2 sentences with a concrete next action or focus area")


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


class ReportResponse(ORMModel):
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
