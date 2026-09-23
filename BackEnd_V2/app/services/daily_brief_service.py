"""
Daily brief generation and delivery.

Triggered by planner_service on the first plan load of the day.
Runs in a daemon thread — safe to call from a FastAPI threadpool.

  short_brief    — 1 sentence, ≤140 chars; notification body + push.
  complete_brief — 3–4 paragraphs; stored in daily_briefs, shown on
                   /daily-brief page and optionally emailed.
  spoken_brief   — separate rendering of the same brief for TTS playback
                   (see get_or_generate_brief_audio); falls back to
                   complete_brief for rows generated before this existed.

Dedup is handled by notifications_service via event_key = "daily_brief:{user_id}:{date}".
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.common import today_ist
from app.core.exceptions import AppError, NotFoundError
from app.db.session import SessionLocal
from app.llm.models import GenerateBriefFromLLM
from app.llm.service import get_llm_service_for_ai_behavior
from app.models.daily_brief import DailyBriefDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.user import UserDBM
from app.models.user_setting import UserSettingDBM
from app.services import notifications_service, settings_service

logger = logging.getLogger(__name__)


# ─── Plan context ─────────────────────────────────────────────────────────────

def _get_plan_items(db: Session, user_id: int, target_date: date) -> list[DailyPlanRecordDBM]:
    return list(db.scalars(
        select(DailyPlanRecordDBM).where(
            DailyPlanRecordDBM.user_id == user_id,
            DailyPlanRecordDBM.scheduled_date == target_date,
            DailyPlanRecordDBM.status == "due",
        )
    ).all())


def _build_context(items: list[DailyPlanRecordDBM]) -> dict:
    context: dict[str, list[dict]] = {"habits": [], "tasks": [], "scheduled": []}
    for r in items:
        entry = {
            "title": r.title,
            "source_type": r.source_type or "habit",
            "priority": r.priority,
            "preferred_time": r.preferred_time,
            "specific_time": r.specific_time,
        }
        if r.source_type == "task":
            context["tasks"].append(entry)
        elif r.source_type == "schedule":
            context["scheduled"].append(entry)
        else:
            context["habits"].append(entry)
    return context


# ─── Brief generation ─────────────────────────────────────────────────────────

async def _call_llm_service(
    user_id: int, first_name: str, today: date, context: dict, ai_behavior: dict,
) -> GenerateBriefFromLLM:
    """Fresh LLMService per call — this runs inside a new event loop (via
    asyncio.run() in a daemon thread), so the client must not be a cross-thread
    cached singleton."""
    service = get_llm_service_for_ai_behavior(ai_behavior)
    try:
        return await service.generate_daily_brief(
            user_id, first_name, today, context, model=ai_behavior["ai_default_model"],
        )
    finally:
        await service.close()


def _generate_briefs(user_id: int, first_name: str, today: date, context: dict, ai_behavior: dict) -> tuple[str, str, str]:
    """Call the LLM provider. Raises on failure — no synthetic brief is ever sent."""
    response = asyncio.run(_call_llm_service(user_id, first_name, today, context, ai_behavior))
    return (
        response.brief_data.short_brief[:200],
        response.brief_data.complete_brief[:2000],
        response.brief_data.spoken_brief[:2000],
    )


# ─── Preferences ──────────────────────────────────────────────────────────────

def _brief_prefs(db: Session, user_id: int) -> dict:
    """Returns the user's notification prefs dict, or {} if none configured."""
    row = db.scalar(select(UserSettingDBM).where(UserSettingDBM.user_id == user_id))
    if row and row.notifications:
        return dict(row.notifications)
    return {}


# ─── Public API ───────────────────────────────────────────────────────────────

def send_daily_brief(user_id: int, today: date) -> None:
    """Generate and deliver the daily brief for one user.

    Fully sync — safe to call from a daemon thread. Opens its own DB session.
    """
    try:
        with SessionLocal() as db:
            user = db.get(UserDBM, user_id)
            if not user:
                return

            prefs = _brief_prefs(db, user.id)
            if not prefs.get("daily_brief_enabled", False):
                return

            first_name = user.name.split()[0] if user.name else "there"
            items = _get_plan_items(db, user.id, today)
            context = _build_context(items)
            ai_behavior = settings_service.get_ai_behavior(db, user.id)

            short_brief, complete_brief, spoken_brief = _generate_briefs(user.id, first_name, today, context, ai_behavior)
            title = f"Good morning, {first_name}! Here's your {today.strftime('%A')}"

            notif = notifications_service.create_notification(
                db, user,
                title=title,
                body=short_brief,
                type="system",
                level=notifications_service.LEVEL_INFORMATIONAL,
                url=f"/daily-brief?date={today}",
                event_key=f"daily_brief:{user.id}:{today}",
            )
            if notif is None:
                return  # blocked by notification prefs or already sent today

            db.add(DailyBriefDBM(
                notification_id=notif.id,
                user_id=user.id,
                brief_date=today,
                complete_brief=complete_brief,
                spoken_brief=spoken_brief,
            ))
            db.commit()

            if prefs.get("email_notifications_enabled", False):
                try:
                    from app.services import email_notification_service
                    email_notification_service.send_daily_brief_email(user, complete_brief, today)
                except Exception:
                    logger.warning("Daily brief email failed for user %d", user.id, exc_info=True)

    except Exception:
        logger.exception("Daily brief failed for user %d", user_id)


def get_brief_for_date(db: Session, user_id: int, target_date: date) -> dict:
    """Return the brief for a given date. complete_brief is None if not yet generated."""
    from app.models.daily_brief_audio import DailyBriefAudioDBM

    brief = db.scalar(
        select(DailyBriefDBM).where(
            DailyBriefDBM.user_id == user_id,
            DailyBriefDBM.brief_date == target_date,
        )
    )
    has_audio = db.scalar(
        select(DailyBriefAudioDBM.id).where(
            DailyBriefAudioDBM.user_id == user_id,
            DailyBriefAudioDBM.brief_date == target_date,
        )
    ) is not None
    return {
        "complete_brief": brief.complete_brief if brief else None,
        "spoken_brief": brief.spoken_brief if brief and brief.spoken_brief else None,
        "date": target_date.isoformat(),
        "generated_at": brief.created_at.isoformat() if brief else None,
        "has_audio": has_audio,
    }


async def get_or_generate_brief_audio(db: Session, user_id: int, target_date: date) -> bytes:
    """Returns cached TTS audio for this brief, generating (and caching) it on first request."""
    from app.models.daily_brief_audio import DailyBriefAudioDBM
    from app.llm.tts import synthesize_speech, transcribe_word_timings

    cached = db.scalar(
        select(DailyBriefAudioDBM).where(
            DailyBriefAudioDBM.user_id == user_id,
            DailyBriefAudioDBM.brief_date == target_date,
        )
    )
    if cached:
        return cached.audio_data

    brief = db.scalar(
        select(DailyBriefDBM).where(
            DailyBriefDBM.user_id == user_id,
            DailyBriefDBM.brief_date == target_date,
        )
    )
    if not brief or not brief.complete_brief:
        raise NotFoundError("No brief has been generated for this date yet.")

    audio_data = await synthesize_speech(brief.spoken_brief or brief.complete_brief, user_id=user_id)
    word_timings = await transcribe_word_timings(audio_data, user_id=user_id)

    db.add(DailyBriefAudioDBM(
        user_id=user_id,
        brief_date=target_date,
        audio_data=audio_data,
        word_timings=json.dumps(word_timings) if word_timings else None,
    ))
    try:
        db.commit()
    except IntegrityError:
        # Concurrent request already cached it first — use that row instead.
        db.rollback()
        cached = db.scalar(
            select(DailyBriefAudioDBM).where(
                DailyBriefAudioDBM.user_id == user_id,
                DailyBriefAudioDBM.brief_date == target_date,
            )
        )
        if cached:
            return cached.audio_data

    return audio_data


async def get_brief_captions(db: Session, user_id: int, target_date: date) -> list[dict]:
    """Returns the cached per-word timing data for this brief's audio, or an
    empty list if no audio has been generated yet or transcription failed."""
    from app.models.daily_brief_audio import DailyBriefAudioDBM

    cached = db.scalar(
        select(DailyBriefAudioDBM).where(
            DailyBriefAudioDBM.user_id == user_id,
            DailyBriefAudioDBM.brief_date == target_date,
        )
    )
    if not cached or not cached.word_timings:
        return []
    return json.loads(cached.word_timings)


async def generate_brief_now(db: Session, user: UserDBM, target_date: date) -> dict:
    """Generate today's brief on demand — triggered by the "Brief me" button.

    Runs inline on the request's own event loop (unlike send_daily_brief, which
    runs in a daemon thread). Bypasses daily_brief_enabled and the notifications
    master toggle — an explicit click is intent enough — but still dedupes via
    event_key so it can't double up with the automatic morning brief.
    """
    if target_date != today_ist():
        raise AppError("Only today's brief can be generated on demand.")

    existing = get_brief_for_date(db, user.id, target_date)
    if existing["complete_brief"] is not None:
        return existing

    items = _get_plan_items(db, user.id, target_date)
    if not items:
        raise AppError("There's nothing in today's plan yet — nothing to brief.")

    first_name = user.name.split()[0] if user.name else "there"
    context = _build_context(items)
    ai_behavior = settings_service.get_ai_behavior(db, user.id)
    response = await _call_llm_service(user.id, first_name, target_date, context, ai_behavior)
    short_brief = response.brief_data.short_brief[:200]
    complete_brief = response.brief_data.complete_brief[:2000]
    spoken_brief = response.brief_data.spoken_brief[:2000]

    title = f"Good morning, {first_name}! Here's your {target_date.strftime('%A')}"
    event_key = f"daily_brief:{user.id}:{target_date}"
    notif = notifications_service.create_notification(
        db, user,
        title=title,
        body=short_brief,
        type="system",
        level=notifications_service.LEVEL_INFORMATIONAL,
        url=f"/daily-brief?date={target_date}",
        event_key=event_key,
        force=True,
    )
    if notif is None:
        # force=True still dedupes on event_key — a concurrent request (or an
        # orphaned notification from an earlier failed attempt) already claims
        # this key, so reuse its id.
        from app.models.notification import NotificationDBM
        notif = db.scalar(
            select(NotificationDBM).where(
                NotificationDBM.user_id == user.id,
                NotificationDBM.event_key == event_key,
            )
        )

        # That concurrent request may have already written the brief too —
        # don't attempt a second insert against the (user_id, brief_date)
        # unique index.
        existing = get_brief_for_date(db, user.id, target_date)
        if existing["complete_brief"] is not None:
            return existing

    db.add(DailyBriefDBM(
        notification_id=notif.id,
        user_id=user.id,
        brief_date=target_date,
        complete_brief=complete_brief,
        spoken_brief=spoken_brief,
    ))
    try:
        db.commit()
    except IntegrityError:
        # Lost a last-instant race against another concurrent request.
        db.rollback()
        return get_brief_for_date(db, user.id, target_date)

    prefs = _brief_prefs(db, user.id)
    if prefs.get("email_notifications_enabled", False):
        try:
            from app.services import email_notification_service
            email_notification_service.send_daily_brief_email(user, complete_brief, target_date)
        except Exception:
            logger.warning("Daily brief email failed for user %d", user.id, exc_info=True)

    return get_brief_for_date(db, user.id, target_date)

