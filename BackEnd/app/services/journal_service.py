"""Journal business logic."""

from __future__ import annotations

from difflib import SequenceMatcher
import json
import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.orchestrator import (
    extract_journal_memory_insights,
    generate_journal_goal_alignment,
    generate_journal_reflection,
)
from app.llm.base import LLMProvider
from app.memory.context import compile_user_context
from app.models.enums import GoalStatus, JournalMood, MemoryCategory, MemorySource
from app.models.goal import Goal
from app.models.journal import JournalEntry
from app.models.memory import MemoryEntry
from app.models.user import User
from app.schemas.journal import JournalCreate, JournalUpdate
from app.services import settings_service
from app.services.utils import get_owned_or_404

logger = logging.getLogger(__name__)

_NONE_SENTINEL = "NONE"
_MAX_MEMORY_INSIGHTS = 2
_MAX_MEMORY_UNDERSTANDING_CHARS = 320
_MIN_AI_REGEN_CONTENT_CHANGE_CHARS = 15

_SIGNAL_KEYWORDS = (
    "every",
    "daily",
    "usually",
    "often",
    "routine",
    "habit",
    "prefer",
    "struggle",
    "difficult",
    "hard",
    "blocked",
    "procrast",
    "want",
    "goal",
    "aim",
    "consistent",
    "consistency",
    "morning",
    "night",
    "interview",
    "leetcode",
    "dsa",
    "gym",
    "sleep",
)

_CAREER_KEYWORDS = (
    "career",
    "job",
    "interview",
    "leetcode",
    "dsa",
    "coding",
    "code",
    "study",
    "learning",
    "resume",
    "project",
)

_LIFE_KEYWORDS = (
    "health",
    "gym",
    "workout",
    "sleep",
    "diet",
    "walk",
    "run",
    "weight",
    "family",
    "stress",
)

_PERSONALITY_KEYWORDS = (
    "prefer",
    "motivat",
    "focus",
    "distract",
    "anxious",
    "confidence",
    "discipline",
)

_DAILY_KEYWORDS = (
    "every day",
    "daily",
    "morning",
    "night",
    "routine",
    "today",
)

_GOAL_STOPWORDS = {
    "goal",
    "goals",
    "the",
    "with",
    "from",
    "that",
    "this",
    "about",
    "into",
    "your",
    "their",
}


def _normalize_whitespace(value: str) -> str:
    return " ".join(value.strip().split())


def _clip_text(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    clipped = value[:max_chars]
    return clipped.rsplit(" ", 1)[0].rstrip() or clipped


def _mood_value(mood: JournalMood | None) -> str | None:
    return mood.value if mood is not None else None


def _coerce_mood(value: str | None) -> JournalMood | None:
    if value is None:
        return None
    try:
        return JournalMood(value)
    except ValueError:
        return None


def _content_change_char_count(original: str, updated: str) -> int:
    if original == updated:
        return 0

    matcher = SequenceMatcher(a=original, b=updated)
    changed = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        changed += max(i2 - i1, j2 - j1)
    return changed


def _active_goals(db: Session, user: User) -> list[Goal]:
    return list(
        db.scalars(
            select(Goal)
            .where(Goal.user_id == user.id, Goal.status == GoalStatus.active)
            .order_by(Goal.created_at.desc())
        )
    )


def _active_goal_summaries(goals: list[Goal]) -> list[str]:
    return [f"{goal.title} ({goal.progress}% complete)" for goal in goals]


def _extract_keywords(text: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {
        token
        for token in tokens
        if len(token) >= 4 and token not in _GOAL_STOPWORDS
    }


def _fallback_goal_alignment(
    content: str,
    mood: JournalMood | None,
    goals: list[Goal],
) -> str:
    if not goals:
        return (
            "No active goals are set yet, so this entry cannot be scored for alignment. "
            "Next step: define one active goal so daily reflections can be mapped to progress."
        )

    content_keywords = _extract_keywords(content)
    supported: list[str] = []
    for goal in goals:
        goal_text = f"{goal.title} {goal.description or ''}"
        if _extract_keywords(goal_text) & content_keywords:
            supported.append(goal.title)

    if supported:
        summary = f"This entry supports these active goals: {', '.join(supported)}."
    else:
        summary = "This entry does not clearly map to an active goal yet."

    if mood in {JournalMood.low, JournalMood.rough}:
        risk = (
            "Current mood suggests lower energy, so momentum may be at risk unless tomorrow's plan "
            "stays small and specific."
        )
    else:
        risk = "No major alignment risk is obvious from today's reflection."

    if supported:
        next_step = (
            "Next step: schedule one concrete task tomorrow that directly advances one supported goal."
        )
    else:
        next_step = (
            "Next step: choose one active goal and write tomorrow's first task to explicitly support it."
        )

    return f"{summary} {risk} {next_step}"


def list_entries(db: Session, user: User) -> list[JournalEntry]:
    return list(
        db.scalars(
            select(JournalEntry)
            .where(JournalEntry.user_id == user.id)
            .order_by(JournalEntry.created_at.desc())
        )
    )


def _fallback_shadow_response(mood: JournalMood | None) -> str:
    mood_value = _mood_value(mood)
    if mood:
        return (
            "Thanks for sharing this reflection. "
            f"I can hear that you're feeling {mood_value.lower()}. "
            "Take one small, intentional step tomorrow and keep building consistency."
        )
    return (
        "Thanks for sharing this reflection. "
        "Keep showing up with honest check-ins and take one small, intentional step "
        "toward your goals tomorrow."
    )


def _generate_shadow_response(
    db: Session,
    user: User,
    *,
    content: str,
    mood: JournalMood | None,
    provider: LLMProvider,
) -> str:
    preferred_model = settings_service.get_effective_ai_model(db, user)
    try:
        reflection = generate_journal_reflection(
            provider,
            entry_content=content,
            mood=_mood_value(mood),
            user_context=compile_user_context(db, user),
            model=preferred_model,
        )
        reflection = _normalize_whitespace(reflection)
        if reflection and not reflection.upper().startswith(_NONE_SENTINEL):
            return reflection
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to generate Shadow journal reflection")
    return _fallback_shadow_response(mood)


def _generate_goal_alignment(
    db: Session,
    user: User,
    *,
    content: str,
    mood: JournalMood | None,
    provider: LLMProvider,
) -> str:
    goals = _active_goals(db, user)
    preferred_model = settings_service.get_effective_ai_model(db, user)
    try:
        analysis = generate_journal_goal_alignment(
            provider,
            entry_content=content,
            mood=_mood_value(mood),
            active_goals=_active_goal_summaries(goals),
            user_context=compile_user_context(db, user),
            model=preferred_model,
        )
        analysis = _normalize_whitespace(analysis)
        if analysis and not analysis.upper().startswith(_NONE_SENTINEL):
            return analysis
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to generate journal goal alignment")

    return _fallback_goal_alignment(content, mood, goals)


def _strip_json_fence(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped

    lines = [line for line in stripped.splitlines() if not line.startswith("```")]
    return "\n".join(lines).strip()


def _parse_memory_insights_json(raw_text: str) -> list[tuple[MemoryCategory, str]]:
    payload_text = _strip_json_fence(raw_text)
    if not payload_text:
        return []

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        return []

    rows = payload.get("insights") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []

    parsed: list[tuple[MemoryCategory, str]] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue

        category_raw = str(row.get("category", "other")).strip().lower()
        try:
            category = MemoryCategory(category_raw)
        except ValueError:
            category = MemoryCategory.other

        understanding = _normalize_whitespace(str(row.get("understanding", "")))
        if understanding.lower().startswith("[fake-llm]"):
            continue
        if len(understanding) < 18:
            continue
        understanding = _clip_text(understanding, _MAX_MEMORY_UNDERSTANDING_CHARS)

        key = understanding.lower()
        if key in seen:
            continue
        seen.add(key)
        parsed.append((category, understanding))

    return parsed


def _infer_memory_category(content_lower: str) -> MemoryCategory:
    if any(keyword in content_lower for keyword in _CAREER_KEYWORDS):
        return MemoryCategory.career
    if any(keyword in content_lower for keyword in _LIFE_KEYWORDS):
        return MemoryCategory.life
    if any(keyword in content_lower for keyword in _PERSONALITY_KEYWORDS):
        return MemoryCategory.personality
    if any(keyword in content_lower for keyword in _DAILY_KEYWORDS):
        return MemoryCategory.daily
    return MemoryCategory.other


def _rewrite_to_third_person(content: str) -> str:
    rewritten = re.sub(r"\bI'm\b", "The user is", content, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bI am\b", "The user is", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bI've\b", "The user has", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bI\b", "The user", rewritten)
    rewritten = re.sub(r"\bmy\b", "the user's", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bme\b", "the user", rewritten, flags=re.IGNORECASE)
    rewritten = _normalize_whitespace(rewritten)
    if not rewritten:
        return ""
    rewritten = rewritten[0].upper() + rewritten[1:]
    if rewritten[-1] not in ".!?":
        rewritten += "."
    return rewritten


def _heuristic_memory_insights(
    content: str,
    mood: JournalMood | None,
) -> list[tuple[MemoryCategory, str]]:
    normalized = _normalize_whitespace(content)
    if not normalized:
        return []

    lowered = normalized.lower()
    has_signal = len(normalized) >= 40 and any(
        keyword in lowered for keyword in _SIGNAL_KEYWORDS
    )

    insights: list[tuple[MemoryCategory, str]] = []
    if has_signal:
        category = _infer_memory_category(lowered)
        rewritten = _rewrite_to_third_person(
            _clip_text(normalized, _MAX_MEMORY_UNDERSTANDING_CHARS)
        )
        if rewritten:
            insights.append((category, rewritten))

    if mood in {JournalMood.low, JournalMood.rough}:
        insights.append(
            (
                MemoryCategory.personality,
                (
                    "The user sometimes reports low-energy emotional states in daily reflections "
                    "and may benefit from lighter plans plus supportive accountability when "
                    "motivation dips."
                ),
            )
        )

    deduped: list[tuple[MemoryCategory, str]] = []
    seen: set[str] = set()
    for category, understanding in insights:
        key = understanding.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append((category, understanding))
    return deduped


def _extract_memory_insights(
    db: Session,
    user: User,
    *,
    content: str,
    mood: JournalMood | None,
    provider: LLMProvider,
) -> list[tuple[MemoryCategory, str]]:
    preferred_model = settings_service.get_effective_ai_model(db, user)
    try:
        raw = extract_journal_memory_insights(
            provider,
            entry_content=content,
            mood=_mood_value(mood),
            user_context=compile_user_context(db, user),
            model=preferred_model,
        )
        parsed = _parse_memory_insights_json(raw)
        if parsed:
            return parsed[:_MAX_MEMORY_INSIGHTS]
    except Exception:  # pragma: no cover - defensive fallback
        logger.exception("Failed to extract journal memory insights")

    return _heuristic_memory_insights(content, mood)[:_MAX_MEMORY_INSIGHTS]


def _store_memory_insights(
    db: Session,
    user: User,
    insights: list[tuple[MemoryCategory, str]],
) -> None:
    seen: set[str] = set()
    inserted = 0
    for category, understanding in insights:
        normalized = _normalize_whitespace(understanding)
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)

        duplicate = db.scalar(
            select(MemoryEntry.id).where(
                MemoryEntry.user_id == user.id,
                MemoryEntry.source == MemorySource.behavior,
                MemoryEntry.ai_understanding == normalized,
            )
        )
        if duplicate is not None:
            continue

        db.add(
            MemoryEntry(
                user_id=user.id,
                category=category,
                ai_understanding=normalized,
                source=MemorySource.behavior,
            )
        )
        inserted += 1
        if inserted >= _MAX_MEMORY_INSIGHTS:
            break

    if inserted:
        db.commit()


def create_entry(
    db: Session,
    user: User,
    data: JournalCreate,
    provider: LLMProvider,
) -> JournalEntry:
    mood_value = _mood_value(data.mood)
    shadow_response = _generate_shadow_response(
        db,
        user,
        content=data.content,
        mood=data.mood,
        provider=provider,
    )
    goal_alignment = _generate_goal_alignment(
        db,
        user,
        content=data.content,
        mood=data.mood,
        provider=provider,
    )

    entry = JournalEntry(
        user_id=user.id,
        content=data.content,
        mood=mood_value,
        goal_alignment=goal_alignment,
        shadow_response=shadow_response,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    insights = _extract_memory_insights(
        db,
        user,
        content=data.content,
        mood=data.mood,
        provider=provider,
    )
    if insights:
        _store_memory_insights(db, user, insights)

    return entry


def update_entry(
    db: Session,
    user: User,
    entry_id: int,
    data: JournalUpdate,
    provider: LLMProvider,
) -> JournalEntry:
    entry = get_owned_or_404(db, JournalEntry, entry_id, user.id, name="Journal entry")
    original_content = entry.content

    updates = data.model_dump(exclude_unset=True)
    if "mood" in updates:
        updates["mood"] = _mood_value(updates["mood"])

    for field, value in updates.items():
        setattr(entry, field, value)

    should_refresh_ai = False
    if "content" in updates:
        should_refresh_ai = (
            _content_change_char_count(original_content, entry.content)
            > _MIN_AI_REGEN_CONTENT_CHANGE_CHARS
        )

    if should_refresh_ai:
        mood = _coerce_mood(entry.mood)
        entry.shadow_response = _generate_shadow_response(
            db,
            user,
            content=entry.content,
            mood=mood,
            provider=provider,
        )
        entry.goal_alignment = _generate_goal_alignment(
            db,
            user,
            content=entry.content,
            mood=mood,
            provider=provider,
        )

    db.commit()
    db.refresh(entry)

    if should_refresh_ai:
        mood = _coerce_mood(entry.mood)
        insights = _extract_memory_insights(
            db,
            user,
            content=entry.content,
            mood=mood,
            provider=provider,
        )
        if insights:
            _store_memory_insights(db, user, insights)

    return entry


def delete_entry(db: Session, user: User, entry_id: int) -> None:
    entry = get_owned_or_404(db, JournalEntry, entry_id, user.id, name="Journal entry")
    db.delete(entry)
    db.commit()
