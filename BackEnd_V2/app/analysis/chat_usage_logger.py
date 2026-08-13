from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.analysis.models import LLMUsageRecord
from app.analysis.service import get_analysis_service

logger = logging.getLogger(__name__)


async def log_chat_usage_async(
    *,
    provider: str,
    model: str,
    operation: str,
    request_id: str | None,
    latency_ms: int | None,
    input_tokens: int | None,
    output_tokens: int | None,
    total_tokens: int | None,
    input_cost: float | None,
    output_cost: float | None,
    total_cost: float | None,
    status: str,
    user_id: int | None,
    error: str | None = None,
) -> None:
    try:
        await get_analysis_service().log_llm_usage(
            LLMUsageRecord(
                timestamp=datetime.now(timezone.utc),
                user_id=user_id,
                provider=provider,
                model=model,
                operation=operation,
                request_id=request_id,
                latency_ms=latency_ms,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                input_cost=input_cost,
                output_cost=output_cost,
                total_cost=total_cost,
                status=status,  # type: ignore[arg-type]
                error=error,
            )
        )
    except Exception:
        logger.exception("Failed to persist chat LLM usage logging.")