"""
Daily brief generation and delivery.

Triggered by planner_service on the first plan load of the day.
Runs in a daemon thread — safe to call from a FastAPI threadpool.

  short_brief    — 1 sentence, ≤140 chars; notification body + push.
  complete_brief — 3–4 paragraphs; stored in daily_briefs, shown on
                   /daily-brief page and optionally emailed.

Dedup is handled by notifications_service via event_key = "daily_brief:{user_id}:{date}".
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.llm.models import GenerateBriefFromLLM
from app.llm.service import LLMService
from app.models.daily_brief import DailyBriefDBM
from app.models.plan_record import DailyPlanRecordDBM
from app.models.user import UserDBM
from app.models.user_setting import UserSettingDBM
from app.services import notifications_service

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

async def _call_llm_service(user_id: int, first_name: str, today: date, context: dict) -> GenerateBriefFromLLM:
    """Fresh LLMService per call — this runs inside a new event loop (via
    asyncio.run() in a daemon thread), so the client must not be a cross-thread
    cached singleton."""
    service = LLMService()
    try:
        return await service.generate_daily_brief(user_id, first_name, today, context)
    finally:
        await service.close()


def _generate_briefs(user_id: int, first_name: str, today: date, context: dict) -> tuple[str, str]:
    """Call the LLM provider. Raises on failure — no synthetic brief is ever sent."""
    response = asyncio.run(_call_llm_service(user_id, first_name, today, context))
    return response.brief_data.short_brief[:200], response.brief_data.complete_brief[:2000]


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

            short_brief, complete_brief = _generate_briefs(user.id, first_name, today, context)
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
    brief = db.scalar(
        select(DailyBriefDBM).where(
            DailyBriefDBM.user_id == user_id,
            DailyBriefDBM.brief_date == target_date,
        )
    )
    return {
        "complete_brief": brief.complete_brief if brief else None,
        "date": target_date.isoformat(),
        "generated_at": brief.created_at.isoformat() if brief else None,
    }
