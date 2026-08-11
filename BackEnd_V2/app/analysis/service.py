from __future__ import annotations

import asyncio
import logging
import re
from functools import lru_cache
from traceback import format_exception

from app.analysis.config import AnalysisSettings, analysis_settings
from app.analysis.google_sheets import GoogleSheetsAnalysisClient
from app.analysis.models import APIUsageRecord, ErrorRecord, LLMUsageRecord

logger = logging.getLogger(__name__)


class AnalysisService:
    def __init__(
        self,
        settings: AnalysisSettings | None = None,
        client: GoogleSheetsAnalysisClient | None = None,
    ) -> None:
        self._settings = settings or analysis_settings
        self._client = client or GoogleSheetsAnalysisClient(self._settings)

    @property
    def enabled(self) -> bool:
        return self._settings.analysis_enabled

    async def log_llm_usage(self, record: LLMUsageRecord) -> None:
        if not self.enabled:
            return

        try:
            await asyncio.to_thread(self._client.append_llm_usage, record)
        except Exception:
            logger.exception("Failed to write LLM usage analytics to Google Sheets.")

    async def log_api_usage(self, record: APIUsageRecord) -> None:
        if not self.enabled:
            return

        try:
            await asyncio.to_thread(self._client.append_api_usage, record)
        except Exception:
            logger.exception("Failed to write API usage analytics to Google Sheets.")

    async def log_error(self, record: ErrorRecord) -> None:
        if not self.enabled:
            return

        try:
            await asyncio.to_thread(self._client.append_error, record)
        except Exception:
            # Do not recurse by attempting to write an Errors record for this failure.
            logger.exception("Failed to write error analytics to Google Sheets.")

    async def log_exception(
        self,
        *,
        user_id: int | None,
        module: str,
        operation: str,
        exc: Exception,
        error_code: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        request_id: str | None = None,
        status_code: int | None = None,
        notes: str | None = None,
    ) -> None:
        if not self.enabled:
            return

        await self.log_error(
            ErrorRecord(
                timestamp=_utc_now(),
                user_id=user_id,
                module=module,
                operation=operation,
                error_type=type(exc).__name__,
                error_code=error_code,
                provider=provider,
                model=model,
                request_id=request_id,
                message=_sanitize_message(str(exc)),
                status_code=status_code,
                stack_trace=_sanitize_stack(exc),
                resolved="No",
                notes=notes,
            )
        )


def _utc_now():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


def _sanitize_message(message: str) -> str:
    return _redact_sensitive(message.strip())[:1000]


def _sanitize_stack(exc: Exception) -> str:
    stack = "".join(format_exception(type(exc), exc, exc.__traceback__))
    return _redact_sensitive(stack)[:2000]


def _redact_sensitive(value: str) -> str:
    patterns = (
        (re.compile(r"(?i)(api[_-]?key\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
        (re.compile(r"(?i)(access[_-]?token\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
        (re.compile(r"(?i)(password\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
        (re.compile(r"(?i)(private[_-]?key\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
        (re.compile(r"(?i)(authorization\s*:\s*bearer\s+)([^\s,;]+)"), r"\1[REDACTED]"),
        (re.compile(r"(?i)(access_token=)[^&\s]+"), r"\1[REDACTED]"),
        (re.compile(r"(?i)(api_key=)[^&\s]+"), r"\1[REDACTED]"),
        (re.compile(r"(?i)(password=)[^&\s]+"), r"\1[REDACTED]"),
        (re.compile(r"\bsk-[A-Za-z0-9_-]+\b"), "[REDACTED]"),
    )

    redacted = value
    for pattern, replacement in patterns:
        redacted = pattern.sub(replacement, redacted)

    return redacted


@lru_cache(maxsize=1)
def get_analysis_service() -> AnalysisService:
    return AnalysisService()
