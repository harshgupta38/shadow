from dataclasses import dataclass

from pydantic import BaseModel, Field
from app.llm.enums import LLMProvider, ModelKey
from app.schemas.goals import UnderstandGoalRequest, UnderstandGoalResponse
from app.schemas.chat import MessageData, ConversationData


@dataclass(frozen=True)
class ModelCost:
    input_token_cost: float | None
    output_token_cost: float | None


@dataclass(frozen=True)
class TokenCostBreakdown:
    input_token_cost: float = 0.0
    output_token_cost: float = 0.0
    total_cost: float = 0.0


class TokenUsage(BaseModel):
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class LLMResponseMetadata(BaseModel):
    provider: LLMProvider
    model: ModelKey
    model_str: str | None = None
    finish_reason: str
    usage: TokenUsage | None = None
    response_id: str | None = None
    response_time_ms: int | None = None
    cost: TokenCostBreakdown | None = None


class RefineGoalResponse(LLMResponseMetadata):
    refined_data: UnderstandGoalResponse


class RefineGoalRequest(BaseModel):
    request_data: UnderstandGoalRequest
    user_id: int | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, gt=0)


class SendMessageResponse(LLMResponseMetadata):
    message_data: MessageData
    conversation_data: ConversationData | None = None
