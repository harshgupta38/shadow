from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import re
from typing import Literal

from app.analysis.time_utils import format_analytics_timestamp


UsageStatus = Literal["success", "error"]

_SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)(api[_-]?key\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(access[_-]?token\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(refresh[_-]?token\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(password\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(private[_-]?key\s*[=:]\s*)([^\s,;]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(authorization\s*:\s*bearer\s+)([^\s,;]+)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(access_token=)[^&\s]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(api_key=)[^&\s]+"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(password=)[^&\s]+"), r"\1[REDACTED]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]+\b"), "[REDACTED]"),
)


def _redact_secrets(value: str) -> str:
    redacted = value
    for pattern, replacement in _SECRET_PATTERNS:
        redacted = pattern.sub(replacement, redacted)
    return redacted


def _sanitize_text(value: str | None, max_length: int = 1000) -> str:
    if value is None:
        return ""
    return _redact_secrets(value.strip())[:max_length]


@dataclass(frozen=True)
class LLMUsageRecord:
    timestamp: datetime
    user_id: int | None
    provider: str
    model: str
    operation: str
    request_id: str | None
    latency_ms: int | None
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    input_cost: float | None
    output_cost: float | None
    total_cost: float | None
    status: UsageStatus
    error: str | None = None

    def to_sheet_row(self) -> list[object]:
        total_tokens = self.total_tokens
        if total_tokens is None:
            total_tokens = (self.input_tokens or 0) + (self.output_tokens or 0)

        total_cost = self.total_cost
        if total_cost is None:
            total_cost = (self.input_cost or 0.0) + (self.output_cost or 0.0)

        return [
            format_analytics_timestamp(self.timestamp),
            self.user_id if self.user_id is not None else "",
            _sanitize_text(self.provider),
            _sanitize_text(self.model),
            _sanitize_text(self.operation),
            _sanitize_text(self.request_id),
            self.latency_ms if self.latency_ms is not None else "",
            self.input_tokens if self.input_tokens is not None else "",
            self.output_tokens if self.output_tokens is not None else "",
            total_tokens,
            self.input_cost if self.input_cost is not None else "",
            self.output_cost if self.output_cost is not None else "",
            total_cost,
            self.status,
            _sanitize_text(self.error),
        ]


@dataclass(frozen=True)
class APIUsageRecord:
    timestamp: datetime
    user_id: int | None
    service: str
    api: str
    operation: str
    request_id: str | None
    method: str | None
    endpoint: str | None
    status_code: int | None
    latency_ms: int | None
    request_size: int | None
    response_size: int | None
    estimated_cost: float | None
    status: UsageStatus
    error: str | None = None

    def to_sheet_row(self) -> list[object]:
        return [
            format_analytics_timestamp(self.timestamp),
            self.user_id if self.user_id is not None else "",
            _sanitize_text(self.service),
            _sanitize_text(self.api),
            _sanitize_text(self.operation),
            _sanitize_text(self.request_id),
            _sanitize_text(self.method),
            _sanitize_text(self.endpoint),
            self.status_code if self.status_code is not None else "",
            self.latency_ms if self.latency_ms is not None else "",
            self.request_size if self.request_size is not None else "",
            self.response_size if self.response_size is not None else "",
            self.estimated_cost if self.estimated_cost is not None else "",
            self.status,
            _sanitize_text(self.error),
        ]


@dataclass(frozen=True)
class ErrorRecord:
    timestamp: datetime
    user_id: int | None
    module: str
    operation: str
    error_type: str
    error_code: str | None
    provider: str | None
    model: str | None
    request_id: str | None
    message: str
    status_code: int | None
    stack_trace: str | None
    resolved: Literal["Yes", "No"] = "No"
    notes: str | None = None

    def to_sheet_row(self) -> list[object]:
        return [
            format_analytics_timestamp(self.timestamp),
            self.user_id if self.user_id is not None else "",
            _sanitize_text(self.module),
            _sanitize_text(self.operation),
            _sanitize_text(self.error_type),
            _sanitize_text(self.error_code),
            _sanitize_text(self.provider),
            _sanitize_text(self.model),
            _sanitize_text(self.request_id),
            _sanitize_text(self.message),
            self.status_code if self.status_code is not None else "",
            _sanitize_text(self.stack_trace, max_length=2000),
            self.resolved,
            _sanitize_text(self.notes),
        ]
