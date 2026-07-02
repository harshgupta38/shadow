"""Memory (understanding) business logic."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import (
    generate_manual_memory_understanding,
    validate_manual_memory_understanding,
)
from app.llm.base import LLMProvider
from app.llm.fake_provider import FakeLLMProvider
from app.memory.context import compile_user_context
from app.models.memory import MemoryEntry
from app.models.enums import MemorySource
from app.models.user import User
from app.schemas.memory import (
    MemoryCenterEntryRead,
    MemoryEntryCreate,
    MemoryRefineRequest,
    MemoryEntryUpdate,
)
from app.services.utils import get_owned_or_404

_MEMORY_USED_BY = ["assistant", "planner", "reports", "journal"]
_MAX_REFINED_MEMORY_CHARS = 520
_MAX_REFINEMENT_ATTEMPTS = 2
_REFINE_STATUS_REFINED = "refined"
_REFINE_STATUS_FALLBACK = "fallback"
_TOKEN_STRIP_CHARS = ".,;:!?()[]{}\"'`"
_DISALLOWED_OUTPUT_LABELS = (
    "what:",
    "why:",
    "when:",
    "how:",
    "timing:",
    "approach:",
    "motivation:",
)
_FALLBACK_REASON_LLM_UNAVAILABLE = (
    "AI refinement is unavailable right now, so Shadow kept your original text."
)
_FALLBACK_REASON_REFINEMENT_ERROR = (
    "Shadow could not process this detail right now, so your original text was kept."
)
_FALLBACK_REASON_EMPTY = (
    "Shadow received an empty refine result, so your original text was kept."
)
_FALLBACK_REASON_VALIDATION = (
    "Shadow could not safely refine this detail while preserving all facts, so your original text was kept."
)
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MemoryRefineResult:
    refined_text: str
    status: str
    reason: str | None = None


def _normalize_whitespace(value: str) -> str:
    return " ".join(value.strip().split())


def _lossless_fallback(raw_text: str) -> str:
    return _normalize_whitespace(raw_text)


def _is_fake_provider(provider: LLMProvider) -> bool:
    return isinstance(provider, FakeLLMProvider)


def _fallback_result(raw_text: str, reason: str) -> MemoryRefineResult:
    return MemoryRefineResult(
        refined_text=_lossless_fallback(raw_text),
        status=_REFINE_STATUS_FALLBACK,
        reason=reason,
    )


def _normalize_subject_reference(raw_text: str, refined_text: str, user_name: str | None) -> str:
    """Prefer neutral subject phrasing unless the user name is in the raw note."""
    normalized_name = _normalize_whitespace(user_name or "")
    if not normalized_name:
        return refined_text

    lower_raw = raw_text.lower()
    lower_name = normalized_name.lower()
    if lower_name in lower_raw:
        return refined_text

    lower_refined = refined_text.lower()
    if lower_refined.startswith(lower_name + "'s "):
        suffix = refined_text[len(normalized_name) + 3 :].strip()
        return ("The user's " + suffix).strip()
    if lower_refined.startswith(lower_name + " "):
        suffix = refined_text[len(normalized_name) :].strip()
        return ("The user " + suffix).strip()
    return refined_text


def _extract_tokens(text: str) -> list[str]:
    tokens: list[str] = []
    for token in text.split():
        cleaned = token.strip(_TOKEN_STRIP_CHARS).lower()
        if cleaned:
            tokens.append(cleaned)
    return tokens


def _extract_numeric_tokens(text: str) -> list[str]:
    return [token for token in _extract_tokens(text) if any(ch.isdigit() for ch in token)]


def _find_missing_numeric_tokens(raw_text: str, refined_text: str) -> list[str]:
    raw_numbers = _extract_numeric_tokens(raw_text)
    if not raw_numbers:
        return []

    refined_tokens = set(_extract_tokens(refined_text))
    return [token for token in raw_numbers if token not in refined_tokens]


def _find_format_issue(refined_text: str) -> str | None:
    lines = [line.strip() for line in refined_text.splitlines() if line.strip()]
    if any(line.startswith(("-", "*", "•", "#")) for line in lines):
        return "Output must be plain prose without markdown or bullet formatting."

    lowered = refined_text.lower()
    for label in _DISALLOWED_OUTPUT_LABELS:
        if label in lowered:
            return f"Output includes disallowed label '{label}'."

    sentence_count = sum(1 for ch in refined_text if ch in ".!?")
    if sentence_count > 3:
        return "Output exceeds 3 sentences."

    return None


def _sanitize_refined(generated: str) -> str:
    refined = _normalize_whitespace(generated.strip(" \n\t\"'`"))
    if not refined:
        return ""

    if len(refined) > _MAX_REFINED_MEMORY_CHARS:
        clipped = refined[:_MAX_REFINED_MEMORY_CHARS]
        refined = clipped.rsplit(" ", 1)[0].rstrip() or clipped
    return refined


def _validate_candidate(
    provider: LLMProvider,
    *,
    raw_text: str,
    refined_text: str,
) -> tuple[bool, str]:
    missing_numbers = _find_missing_numeric_tokens(raw_text, refined_text)
    if missing_numbers:
        return False, (
            "Missing measurable facts from raw note: "
            + ", ".join(missing_numbers)
        )

    format_issue = _find_format_issue(refined_text)
    if format_issue:
        return False, format_issue

    return validate_manual_memory_understanding(
        provider,
        raw_text=raw_text,
        candidate_memory=refined_text,
    )


def _confidence_from_source(source: MemorySource) -> str:
    if source == MemorySource.manual:
        return "very_high"
    if source == MemorySource.onboarding:
        return "high"
    if source == MemorySource.behavior:
        return "medium"
    return "medium"


def list_memories(db: Session, user: User) -> list[MemoryEntry]:
    return list(
        db.scalars(
            select(MemoryEntry)
            .where(MemoryEntry.user_id == user.id)
            .order_by(MemoryEntry.created_at.desc())
        )
    )


def add_memory(db: Session, user: User, data: MemoryEntryCreate) -> MemoryEntry:
    entry = MemoryEntry(
        user_id=user.id,
        category=data.category,
        question=data.question,
        answer=data.answer,
        ai_understanding=data.ai_understanding,
        source=data.source,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def refine_memory_text(
    db: Session,
    user: User,
    provider: LLMProvider,
    data: MemoryRefineRequest,
) -> MemoryRefineResult:
    raw_text = _normalize_whitespace(data.text)
    if not raw_text:
        return MemoryRefineResult(
            refined_text="",
            status=_REFINE_STATUS_FALLBACK,
            reason=_FALLBACK_REASON_EMPTY,
        )

    if _is_fake_provider(provider):
        return _fallback_result(raw_text, _FALLBACK_REASON_LLM_UNAVAILABLE)

    context = compile_user_context(db, user)
    validation_feedback: str | None = None
    last_validation_reason: str | None = None

    for attempt in range(1, _MAX_REFINEMENT_ATTEMPTS + 1):
        try:
            generated = generate_manual_memory_understanding(
                provider,
                raw_text=raw_text,
                category=data.category,
                user_context=context,
                validation_feedback=validation_feedback,
            )
        except Exception:
            logger.exception("Memory text refinement failed; using lossless fallback.")
            return _fallback_result(raw_text, _FALLBACK_REASON_REFINEMENT_ERROR)

        refined = _sanitize_refined(generated)
        if not refined:
            logger.warning("Memory refinement returned empty output; using lossless fallback.")
            return _fallback_result(raw_text, _FALLBACK_REASON_EMPTY)

        # Test/dev fake provider echoes prompts; do not persist that synthetic output.
        if refined.lower().startswith("[fake-llm]"):
            return _fallback_result(raw_text, _FALLBACK_REASON_LLM_UNAVAILABLE)

        refined = _normalize_subject_reference(raw_text, refined, user.name)

        is_valid, reason = _validate_candidate(
            provider,
            raw_text=raw_text,
            refined_text=refined,
        )
        if is_valid:
            return MemoryRefineResult(
                refined_text=refined,
                status=_REFINE_STATUS_REFINED,
                reason=None,
            )

        validation_feedback = reason
        last_validation_reason = reason
        logger.info(
            "Manual memory validation failed on attempt %s/%s: %s",
            attempt,
            _MAX_REFINEMENT_ATTEMPTS,
            reason,
        )

    logger.warning(
        "Memory refinement failed validation after retries; using lossless fallback. Last reason: %s",
        last_validation_reason,
    )
    return _fallback_result(raw_text, _FALLBACK_REASON_VALIDATION)


def update_memory(
    db: Session, user: User, memory_id: int, data: MemoryEntryUpdate
) -> MemoryEntry:
    entry = get_owned_or_404(db, MemoryEntry, memory_id, user.id, name="Memory")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_memory(db: Session, user: User, memory_id: int) -> None:
    entry = get_owned_or_404(db, MemoryEntry, memory_id, user.id, name="Memory")
    db.delete(entry)
    db.commit()


def list_memory_center(db: Session, user: User) -> list[MemoryCenterEntryRead]:
    entries = list_memories(db, user)
    return [
        MemoryCenterEntryRead(
            id=entry.id,
            category=entry.category,
            value=entry.ai_understanding,
            source=entry.source,
            confidence=_confidence_from_source(entry.source),
            editable=True,
            used_by=_MEMORY_USED_BY,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )
        for entry in entries
    ]
