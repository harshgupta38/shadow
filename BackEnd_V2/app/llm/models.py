from pydantic import BaseModel, Field
from app.schemas.goals import UnderstandGoalRequest, UnderstandGoalResponse


class TokenUsage(BaseModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class RefineGoalResponse(BaseModel):
    provider: str
    model: str
    refined_data: UnderstandGoalResponse
    finish_reason: str
    usage: TokenUsage | None = None
    response_id: str | None = None
    response_time_ms: int | None = None


class RefineGoalRequest(BaseModel):
    request_data: UnderstandGoalRequest
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, gt=0)
