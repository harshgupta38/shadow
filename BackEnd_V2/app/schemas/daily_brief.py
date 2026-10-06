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


class DailyBriefSchemaNoAudio(BaseModel):
    """Same as DailyBriefSchema minus spoken_brief — used when the audio/caption feature is
    disabled for a user, so the model is never asked to write it (saves output tokens)."""
    short_brief: str = Field(
        description="One warm, punchy sentence, max 140 characters, for push and in-app notifications."
    )
    complete_brief: str = Field(
        description="3-4 warm paragraphs for the /daily-brief page and email, under 1600 characters."
    )


# ── API response schema ────────────────────────────────────────────────────────

class DailyBriefResponse(BaseModel):
    complete_brief: str | None
    spoken_brief: str | None = None
    date: str
    generated_at: str | None
    has_audio: bool = False
    # Whether this user has the audio/caption feature enabled (feature_toggles.brief_audio_caption).
    # Frontend hides the audio player entirely when false, rather than showing a CTA that would fail.
    audio_feature_enabled: bool = False


# ── Caption timing (word-level, from transcribing the generated audio) ────────────────

class WordTiming(BaseModel):
    word: str
    start: float
    end: float


class DailyBriefCaptionsResponse(BaseModel):
    words: list[WordTiming]
