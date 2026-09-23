from pydantic import BaseModel, Field


# ── LLM output schema (structured output contract with the model) ─────────────

class DailyBriefSchema(BaseModel):
    short_brief: str = Field(
        description="One warm, punchy sentence, max 140 characters, for push and in-app notifications."
    )
    complete_brief: str = Field(
        description="3-4 warm paragraphs for the /daily-brief page and email, under 1600 characters."
    )
    spoken_brief: str = Field(
        description=(
            "A separate rendering of the same brief written to be read aloud by text-to-speech "
            "(not a summary of complete_brief) — conversational spoken rhythm, no lists/headings, "
            "roughly 500-800 characters."
        )
    )


# ── API response schema ────────────────────────────────────────────────────────

class DailyBriefResponse(BaseModel):
    complete_brief: str | None
    date: str
    generated_at: str | None
    has_audio: bool = False
