from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.analysis.models import LLMUsageRecord
from app.analysis.service import AnalysisService, get_analysis_service
from app.llm.config import LLMSettings
from app.llm.cost import calculate_token_cost
from app.llm.enums import LLMProvider
from app.llm.exceptions import LLMConfigurationError
from app.llm.models import RefineGoalResponse

logger = logging.getLogger(__name__)


class LLMUsageLogger:
    def __init__(self, analysis_service: AnalysisService, settings: LLMSettings) -> None:
        self._analysis_service = analysis_service
        self._settings = settings

    def log_refine_goal_success(
        self,
        *,
        user_id: int | None,
        operation: str,
        response: RefineGoalResponse,
    ) -> None:
        usage = response.usage
        cost = response.cost

        self._schedule(
            self._analysis_service.log_llm_usage(
                LLMUsageRecord(
                    timestamp=_utc_now(),
                    user_id=user_id,
                    provider=response.provider.value,
                    model=response.model_str or str(response.model),
                    operation=operation,
                    request_id=response.response_id,
                    latency_ms=response.response_time_ms,
                    input_tokens=usage.input_tokens if usage else None,
                    output_tokens=usage.output_tokens if usage else None,
                    total_tokens=usage.total_tokens if usage else None,
                    input_cost=cost.input_token_cost if cost else None,
                    output_cost=cost.output_token_cost if cost else None,
                    total_cost=cost.total_cost if cost else None,
                    status="success",
                    error=None,
                )
            ),
            "Failed to schedule LLM usage analytics logging.",
        )

    def log_refine_goal_failure(
        self,
        *,
        user_id: int | None,
        operation: str,
        error: Exception,
        latency_ms: int,
        request_id: str | None = None,
    ) -> None:
        provider_name = self._settings.llm_provider.value
        model_name = self._configured_model_for_provider()

        self._schedule(
            self._analysis_service.log_llm_usage(
                LLMUsageRecord(
                    timestamp=_utc_now(),
                    user_id=user_id,
                    provider=provider_name,
                    model=model_name,
                    operation=operation,
                    request_id=request_id,
                    latency_ms=latency_ms,
                    input_tokens=None,
                    output_tokens=None,
                    total_tokens=None,
                    input_cost=None,
                    output_cost=None,
                    total_cost=None,
                    status="error",
                    error=_safe_error_message(error),
                )
            ),
            "Failed to schedule LLM usage analytics logging.",
        )

    @staticmethod
    def missing_refined_goal_error() -> LLMConfigurationError:
        return LLMConfigurationError("LLM provider returned no refined data for the goal.")

    def _configured_model_for_provider(self) -> str:
        if self._settings.llm_provider == LLMProvider.OPENAI:
            return str(self._settings.openai_model)
        if self._settings.llm_provider == LLMProvider.GEMINI:
            return str(self._settings.gemini_model)
        if self._settings.llm_provider == LLMProvider.CLAUDE:
            return str(self._settings.claude_model)
        if self._settings.llm_provider == LLMProvider.OLLAMA:
            return str(self._settings.ollama_model)

        return ""

    @staticmethod
    def _schedule(coro, error_message: str) -> None:
        try:
            asyncio.create_task(coro)
        except Exception:
            logger.exception(error_message)


def log_openai_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    completion: Any,
    latency_ms: int,
    operation: str = "refine_goal",
    user_id: int | None = None,
) -> None:
    """Fire-and-forget usage logging immediately after OpenAI completion is received."""
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

        _enqueue_provider_usage_log(
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
            schedule_error_message="Failed to schedule immediate OpenAI completion usage logging.",
        )
    except Exception:
        logger.exception("Failed to enqueue immediate OpenAI completion usage logging.")


def log_ollama_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    completion: Any,
    latency_ms: int,
    operation: str = "refine_goal",
    user_id: int | None = None,
) -> None:
    """Fire-and-forget usage logging immediately after Ollama completion is received."""
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

        _enqueue_provider_usage_log(
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
            schedule_error_message="Failed to schedule immediate Ollama completion usage logging.",
        )
    except Exception:
        logger.exception("Failed to enqueue immediate Ollama completion usage logging.")


def log_gemini_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    response: Any,
    latency_ms: int,
    operation: str = "refine_goal",
    user_id: int | None = None,
) -> None:
    """Fire-and-forget usage logging immediately after Gemini response is received."""
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

        _enqueue_provider_usage_log(
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
            schedule_error_message="Failed to schedule immediate Gemini completion usage logging.",
        )
    except Exception:
        logger.exception("Failed to enqueue immediate Gemini completion usage logging.")


def log_claude_completion_usage_async(
    *,
    settings: LLMSettings,
    model: str,
    completion: Any,
    latency_ms: int,
    operation: str = "refine_goal",
    user_id: int | None = None,
) -> None:
    """Fire-and-forget usage logging immediately after Claude completion is received."""
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

        _enqueue_provider_usage_log(
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
            schedule_error_message="Failed to schedule immediate Claude completion usage logging.",
        )
    except Exception:
        logger.exception("Failed to enqueue immediate Claude completion usage logging.")


def _enqueue_provider_usage_log(
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
    schedule_error_message: str,
) -> None:
    usage_logger = LLMUsageLogger(get_analysis_service(), settings)
    usage_logger._schedule(
        usage_logger._analysis_service.log_llm_usage(
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
        ),
        schedule_error_message,
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_error_message(error: Exception) -> str:
    return str(error)[:1000]
