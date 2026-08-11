from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.analysis.models import LLMUsageRecord
from app.analysis.service import AnalysisService
from app.llm.config import LLMSettings
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
                    model=str(response.model),
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


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_error_message(error: Exception) -> str:
    return str(error)[:1000]
