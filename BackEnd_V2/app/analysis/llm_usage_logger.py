from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.analysis.models import LLMUsageRecord
from app.analysis.service import get_analysis_service

# do not import LLMSettings directly from app.llm, as it will create a circular import
from app.llm.config import LLMSettings
from app.llm.enums import LLMProvider
from app.llm.cost import calculate_token_cost

logger = logging.getLogger(__name__)


async def log_openai_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    completion: Any,
    latency_ms: int,
    operation: str,
    user_id: int | None = None,
) -> None:
    """Persist usage metadata immediately after OpenAI completion is received."""
    try:
        usage = getattr(completion, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
        total_tokens = getattr(usage, "total_tokens", None) if usage else None

        cost = calculate_token_cost(
            model_key=model,
            input_tokens=prompt_tokens or 0,
            output_tokens=completion_tokens or 0,
        )

        await _write_provider_usage_log(
            settings=settings,
            provider=LLMProvider.OPENAI,
            model=model,
            model_str=getattr(completion, "model", None),
            request_id=getattr(completion, "id", None),
            latency_ms=latency_ms,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost=cost,
            operation=operation,
            user_id=user_id,
        )
    except Exception:
        logger.exception("Failed to persist immediate OpenAI completion usage logging.")


async def log_ollama_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    completion: Any,
    latency_ms: int,
    operation: str,
    user_id: int | None = None,
) -> None:
    """Persist usage metadata immediately after Ollama completion is received."""
    try:
        usage = getattr(completion, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
        total_tokens = getattr(usage, "total_tokens", None) if usage else None

        cost = calculate_token_cost(
            model_key=model,
            input_tokens=prompt_tokens or 0,
            output_tokens=completion_tokens or 0,
        )

        await _write_provider_usage_log(
            settings=settings,
            provider=LLMProvider.OLLAMA,
            model=model,
            model_str=getattr(completion, "model", None),
            request_id=getattr(completion, "id", None),
            latency_ms=latency_ms,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens,
            total_tokens=total_tokens,
            cost=cost,
            operation=operation,
            user_id=user_id,
        )
    except Exception:
        logger.exception("Failed to persist immediate Ollama completion usage logging.")


async def log_gemini_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    response: Any,
    latency_ms: int,
    operation: str,
    user_id: int | None = None,
) -> None:
    """Persist usage metadata immediately after Gemini response is received."""
    try:
        usage_metadata = getattr(response, "usage_metadata", None)
        prompt_tokens = (
            getattr(usage_metadata, "prompt_token_count", None) if usage_metadata else None
        )
        candidate_tokens = (
            getattr(usage_metadata, "candidates_token_count", None)
            if usage_metadata
            else None
        )
        thought_tokens = (
            getattr(usage_metadata, "thoughts_token_count", None) if usage_metadata else None
        )
        completion_tokens = (candidate_tokens or 0) + (thought_tokens or 0)
        total_tokens = (
            getattr(usage_metadata, "total_token_count", None) if usage_metadata else None
        )

        cost = calculate_token_cost(
            model_key=model,
            input_tokens=prompt_tokens or 0,
            output_tokens=completion_tokens,
        )

        await _write_provider_usage_log(
            settings=settings,
            provider=LLMProvider.GEMINI,
            model=model,
            model_str=getattr(response, "model_version", None),
            request_id=getattr(response, "response_id", None),
            latency_ms=latency_ms,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens if usage_metadata else None,
            total_tokens=total_tokens,
            cost=cost,
            operation=operation,
            user_id=user_id,
        )
    except Exception:
        logger.exception("Failed to persist immediate Gemini completion usage logging.")


async def log_claude_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    completion: Any,
    latency_ms: int,
    operation: str,
    user_id: int | None = None,
) -> None:
    """Persist usage metadata immediately after Claude completion is received."""
    try:
        usage = getattr(completion, "usage", None)
        input_tokens = getattr(usage, "input_tokens", None) if usage else None
        output_tokens = getattr(usage, "output_tokens", None) if usage else None
        total_tokens = None
        if input_tokens is not None or output_tokens is not None:
            total_tokens = (input_tokens or 0) + (output_tokens or 0)

        cost = calculate_token_cost(
            model_key=model,
            input_tokens=input_tokens or 0,
            output_tokens=output_tokens or 0,
        )

        await _write_provider_usage_log(
            settings=settings,
            provider=LLMProvider.CLAUDE,
            model=model,
            model_str=getattr(completion, "model", None),
            request_id=getattr(completion, "id", None),
            latency_ms=latency_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            cost=cost,
            operation=operation,
            user_id=user_id,
        )
    except Exception:
        logger.exception("Failed to persist immediate Claude completion usage logging.")


async def _write_provider_usage_log(
    *,
    settings: LLMSettings,
    provider: LLMProvider,
    model: str,
    model_str: str | None,
    request_id: str | None,
    latency_ms: int,
    input_tokens: int | None,
    output_tokens: int | None,
    total_tokens: int | None,
    cost,
    operation: str,
    user_id: int | None,
) -> None:
    await get_analysis_service().log_llm_usage(
        LLMUsageRecord(
            timestamp=_utc_now(),
            user_id=user_id,
            provider=provider.value,
            model=model_str or model,
            operation=operation,
            request_id=request_id,
            latency_ms=latency_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            input_cost=cost.input_token_cost if cost else None,
            output_cost=cost.output_token_cost if cost else None,
            total_cost=cost.total_cost if cost else None,
            status="success",
            error=None,
        )
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)
