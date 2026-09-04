"""Adaptive behavior learning (root README §7.3).

Distills recent activity into a single behavior ``MemoryEntry`` (with
``source=behavior``) so the User Context Document grows richer over time.
The LLM call is injected, so this is fully mockable in tests.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.orchestrator import distill_behavior_signal
from app.llm.base import LLMProvider
from app.memory.context import compile_user_context, summarize_recent_activity
from app.models.enums import MemoryCategory, MemorySource
from app.models.memory import MemoryEntry
from app.models.user import User
from app.services import settings_service

_NONE_SENTINEL = "NONE"


def distill_and_store_behavior(
    db: Session, user: User, provider: LLMProvider
) -> MemoryEntry | None:
    """Infer a behavior signal from recent activity and persist it.

    Returns the created :class:`MemoryEntry`, or ``None`` if there was not
    enough signal.
    """
    activity_summary = summarize_recent_activity(db, user)
    if not activity_summary.strip():
        return None

    preferred_model = settings_service.get_effective_ai_model(db, user)

    signal = distill_behavior_signal(
        provider,
        activity_summary=activity_summary,
        user_context=compile_user_context(db, user),
        model=preferred_model,
    )
    if not signal or signal.strip().upper().startswith(_NONE_SENTINEL):
        return None

    entry = MemoryEntry(
        user_id=user.id,
        category=MemoryCategory.other,
        ai_understanding=signal.strip(),
        source=MemorySource.behavior,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
