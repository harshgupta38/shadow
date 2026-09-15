from pydantic import BaseModel, Field


# ── LLM output schema (structured output contract with the model) ─────────────

class DailyBriefSchema(BaseModel):
    short_brief: str = Field(
        description="One warm, punchy sentence, max 140 characters, for push and in-app notifications."
    )
    complete_brief: str = Field(
        description="3-4 warm paragraphs for the /daily-brief page and email, under 1600 characters."
    )
