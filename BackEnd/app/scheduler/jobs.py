"""Scheduled background jobs (run on the 24/7 server)."""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, or_, select

from app.database import SessionLocal
from app.llm.factory import get_llm_provider
from app.models.email_verification_token import EmailVerificationToken
from app.models.enums import NotificationType, ReportPeriod, ReportSource
from app.models.notification import Notification
from app.models.user import User
from app.models.user_setting import UserSetting
from app.services import auth_service, email_notification_service, push_service, report_service

logger = logging.getLogger(__name__)
_VERIFICATION_REMINDER_INTERVAL = timedelta(days=7)


def _safe_timezone(name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def _local_today_bounds_utc(timezone_name: str, now_utc: datetime) -> tuple[datetime, datetime]:
    tz = _safe_timezone(timezone_name)
    local_now = now_utc.astimezone(tz)
    start_local = datetime.combine(local_now.date(), time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _already_created_today(
    db,
    *,
    user_id: int,
    title_prefix: str,
    timezone_name: str,
    now_utc: datetime,
) -> bool:
    start_utc, end_utc = _local_today_bounds_utc(timezone_name, now_utc)
    existing = db.scalar(
        select(Notification.id).where(
            Notification.user_id == user_id,
            Notification.title.startswith(title_prefix),
            or_(
                and_(
                    Notification.scheduled_at.is_not(None),
                    Notification.scheduled_at >= start_utc,
                    Notification.scheduled_at < end_utc,
                ),
                and_(
                    Notification.scheduled_at.is_(None),
                    Notification.created_at >= start_utc,
                    Notification.created_at < end_utc,
                ),
            ),
        )
    )
    return existing is not None


def _matches_local_time(now_utc: datetime, timezone_name: str, hhmm: str) -> bool:
    tz = _safe_timezone(timezone_name)
    now_local = now_utc.astimezone(tz)
    target_hour, target_minute = hhmm.split(":", 1)
    return now_local.hour == int(target_hour) and now_local.minute == int(target_minute)


def _at_or_after_local_time(now_utc: datetime, timezone_name: str, hhmm: str) -> bool:
    tz = _safe_timezone(timezone_name)
    now_local = now_utc.astimezone(tz)
    now_minutes = now_local.hour * 60 + now_local.minute
    target_hour, target_minute = hhmm.split(":", 1)
    target_minutes = int(target_hour) * 60 + int(target_minute)
    return now_minutes >= target_minutes


def _matches_local_weekday(now_utc: datetime, timezone_name: str, weekday_name: str) -> bool:
    tz = _safe_timezone(timezone_name)
    now_local = now_utc.astimezone(tz)
    weekday_to_index = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    return now_local.weekday() == weekday_to_index.get(weekday_name, 5)


def _enqueue_auto_report_notification(
    db,
    *,
    user: User,
    period: ReportPeriod,
    now_utc: datetime,
) -> None:
    settings = db.scalar(select(UserSetting).where(UserSetting.user_id == user.id))
    if settings is None or not settings.notifications_enabled:
        return

    label = "Daily" if period == ReportPeriod.daily else "Weekly"
    title = f"{label} Report Ready"
    body = (
        f"Your automatic {label.lower()} report is ready. "
        "Open Reports to review insights and next steps."
    )
    db.add(
        Notification(
            user_id=user.id,
            title=title,
            body=body,
            type=NotificationType.system,
            scheduled_at=now_utc,
        )
    )
    db.commit()

    delivered = push_service.send_push_to_user(
        db,
        user,
        title=title,
        body=body,
        url="/reports",
    )
    if delivered:
        logger.info("Delivered %d web push report notification(s) for user_id=%s", delivered, user.id)


def enqueue_daily_briefs(*, now_utc: datetime | None = None) -> int:
    """Create one daily brief notification per eligible user at configured local time."""
    now = (now_utc or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    created = 0
    with SessionLocal() as db:
        settings_rows = list(
            db.scalars(
                select(UserSetting).where(
                    UserSetting.notifications_enabled.is_(True),
                    UserSetting.daily_brief_enabled.is_(True),
                )
            )
        )
        for settings in settings_rows:
            user = db.get(User, settings.user_id)
            if user is None:
                continue
            if not _at_or_after_local_time(now, user.timezone, settings.daily_brief_time):
                continue
            if _already_created_today(
                db,
                user_id=user.id,
                title_prefix="Daily Brief",
                timezone_name=user.timezone,
                now_utc=now,
            ):
                continue
            db.add(
                Notification(
                    user_id=user.id,
                    title="Daily Brief",
                    body="Review your top tasks and focus on one high-impact outcome.",
                    type=NotificationType.system,
                    scheduled_at=now,
                )
            )
            created += 1
        if created:
            db.commit()
            logger.info("Queued %d daily brief notification(s)", created)
    return created


def enqueue_weekly_summaries(*, now_utc: datetime | None = None) -> int:
    """Create one weekly summary notification per eligible user near week-end."""
    now = (now_utc or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    created = 0
    with SessionLocal() as db:
        settings_rows = list(
            db.scalars(
                select(UserSetting).where(
                    UserSetting.notifications_enabled.is_(True),
                    UserSetting.weekly_summary_enabled.is_(True),
                )
            )
        )
        for settings in settings_rows:
            user = db.get(User, settings.user_id)
            if user is None:
                continue
            tz = _safe_timezone(user.timezone)
            local_now = now.astimezone(tz)
            summary_weekday = 6 if settings.week_starts_on.value == "monday" else 5
            if local_now.weekday() != summary_weekday:
                continue
            if not _at_or_after_local_time(now, user.timezone, settings.daily_brief_time):
                continue
            if _already_created_today(
                db,
                user_id=user.id,
                title_prefix="Weekly Summary",
                timezone_name=user.timezone,
                now_utc=now,
            ):
                continue
            db.add(
                Notification(
                    user_id=user.id,
                    title="Weekly Summary",
                    body="Check your weekly progress report and plan next week's priorities.",
                    type=NotificationType.system,
                    scheduled_at=now,
                )
            )
            created += 1
        if created:
            db.commit()
            logger.info("Queued %d weekly summary notification(s)", created)
    return created


def enqueue_daily_motivational_quotes(*, now_utc: datetime | None = None) -> int:
    """Deliver one motivational quote email per eligible user each local day."""
    now = (now_utc or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    created = 0

    with SessionLocal() as db:
        settings_rows = list(
            db.scalars(
                select(UserSetting).where(
                    UserSetting.notifications_enabled.is_(True),
                    UserSetting.email_notifications_enabled.is_(True),
                )
            )
        )

        for settings in settings_rows:
            user = db.get(User, settings.user_id)
            if user is None:
                continue

            controls = email_notification_service.get_email_notification_controls(db, user)
            if not controls.daily_motivational_quote:
                continue

            if not _at_or_after_local_time(now, user.timezone, controls.daily_motivational_quote_time):
                continue

            if _already_created_today(
                db,
                user_id=user.id,
                title_prefix="Daily Motivation",
                timezone_name=user.timezone,
                now_utc=now,
            ):
                continue

            email_notification_service.send_notification_email(
                db,
                user,
                template_key="daily_motivational_quote",
            )
            db.add(
                Notification(
                    user_id=user.id,
                    title="Daily Motivation",
                    body="Your motivational quote email is ready.",
                    type=NotificationType.system,
                    scheduled_at=now,
                    sent=True,
                )
            )
            created += 1

        if created:
            db.commit()
            logger.info("Delivered %d daily motivational quote email(s)", created)

    return created


def enqueue_weekly_verification_reminders(*, now_utc: datetime | None = None) -> int:
    """Send verification reminder emails once every 7 days for unverified users."""
    now = (now_utc or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    sent = 0

    with SessionLocal() as db:
        users = list(db.scalars(select(User).where(User.email_verified.is_(False))))
        for user in users:
            settings = db.scalar(select(UserSetting).where(UserSetting.user_id == user.id))
            if settings is None:
                continue
            if not settings.notifications_enabled or not settings.email_notifications_enabled:
                continue

            controls = email_notification_service.get_email_notification_controls(db, user)
            if not controls.verification_reminders:
                continue

            latest_token = db.scalar(
                select(EmailVerificationToken)
                .where(EmailVerificationToken.user_id == user.id)
                .order_by(EmailVerificationToken.created_at.desc())
            )
            if latest_token is not None:
                last_created = latest_token.created_at
                if last_created.tzinfo is None:
                    last_created = last_created.replace(tzinfo=timezone.utc)
                else:
                    last_created = last_created.astimezone(timezone.utc)
                if now - last_created < _VERIFICATION_REMINDER_INTERVAL:
                    continue

            try:
                dispatch = auth_service.request_email_verification(db, user)
            except Exception:  # pragma: no cover - defensive scheduler guard
                logger.exception("Failed weekly verification reminder for user_id=%s", user.id)
                continue

            if dispatch.email_sent:
                sent += 1

        if sent:
            logger.info("Delivered %d weekly verification reminder email(s)", sent)

    return sent


def enqueue_daily_reports(*, now_utc: datetime | None = None) -> int:
    """Create one automatic daily report per eligible user after configured local time."""
    now = (now_utc or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    created = 0
    provider = get_llm_provider()

    with SessionLocal() as db:
        users = list(db.scalars(select(User)))
        for user in users:
            automation = report_service.get_report_automation_schedule(db, user)
            if not automation["enabled"] or not automation["daily_enabled"]:
                continue
            daily_time = str(automation["daily_time"])
            if not _at_or_after_local_time(now, user.timezone, daily_time):
                continue

            local_now = now.astimezone(_safe_timezone(user.timezone))
            on_date = local_now.date()

            if report_service.automatic_report_exists(
                db,
                user,
                period=ReportPeriod.daily,
                on_date=on_date,
            ):
                continue

            try:
                report_service.generate_report(
                    db,
                    user,
                    provider,
                    period=ReportPeriod.daily,
                    on_date=on_date,
                    source=ReportSource.automatic,
                )
                created += 1
            except Exception:  # pragma: no cover - defensive scheduler guard
                logger.exception("Failed to generate daily report for user_id=%s", user.id)
                continue

            try:
                _enqueue_auto_report_notification(
                    db,
                    user=user,
                    period=ReportPeriod.daily,
                    now_utc=now,
                )
            except Exception:  # pragma: no cover - defensive scheduler guard
                logger.exception("Failed to queue daily report notification for user_id=%s", user.id)

        if created:
            logger.info("Generated %d automatic daily report(s)", created)

    return created


def enqueue_weekly_reports(*, now_utc: datetime | None = None) -> int:
    """Create one automatic weekly report per eligible user after configured local day/time."""
    now = (now_utc or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    created = 0
    provider = get_llm_provider()

    with SessionLocal() as db:
        users = list(db.scalars(select(User)))
        for user in users:
            automation = report_service.get_report_automation_schedule(db, user)
            if not automation["enabled"] or not automation["weekly_enabled"]:
                continue
            weekly_day = str(automation["weekly_day"])
            weekly_time = str(automation["weekly_time"])
            if not _matches_local_weekday(now, user.timezone, weekly_day):
                continue
            if not _at_or_after_local_time(now, user.timezone, weekly_time):
                continue

            on_date = now.astimezone(_safe_timezone(user.timezone)).date()
            if report_service.automatic_report_exists(
                db,
                user,
                period=ReportPeriod.weekly,
                on_date=on_date,
            ):
                continue

            try:
                report_service.generate_report(
                    db,
                    user,
                    provider,
                    period=ReportPeriod.weekly,
                    on_date=on_date,
                    source=ReportSource.automatic,
                )
                created += 1
            except Exception:  # pragma: no cover - defensive scheduler guard
                logger.exception("Failed to generate weekly report for user_id=%s", user.id)
                continue

            try:
                _enqueue_auto_report_notification(
                    db,
                    user=user,
                    period=ReportPeriod.weekly,
                    now_utc=now,
                )
            except Exception:  # pragma: no cover - defensive scheduler guard
                logger.exception("Failed to queue weekly report notification for user_id=%s", user.id)

        if created:
            logger.info("Generated %d automatic weekly report(s)", created)

    return created


def process_due_notifications() -> int:
    """Mark notifications whose ``scheduled_at`` has passed as ``sent``.

    Returns the number of notifications dispatched. Kept simple for the MVP
    and deliver eligible email notifications.
    """
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        due = list(
            db.scalars(
                select(Notification).where(
                    Notification.sent.is_(False),
                    Notification.scheduled_at.is_not(None),
                    Notification.scheduled_at <= now,
                )
            )
        )
        for notification in due:
            settings = db.scalar(
                select(UserSetting).where(UserSetting.user_id == notification.user_id)
            )
            if settings is None:
                notification.sent = True
                continue
            if not settings.notifications_enabled:
                continue
            if notification.type == NotificationType.reminder and not settings.reminder_notifications_enabled:
                continue
            if notification.title.startswith("Daily Brief") and not settings.daily_brief_enabled:
                continue
            if notification.title.startswith("Weekly Summary") and not settings.weekly_summary_enabled:
                continue

            template_key = email_notification_service.resolve_template_key_for_notification(notification)
            if template_key is not None:
                user = db.get(User, notification.user_id)
                if user is not None:
                    context = email_notification_service.context_from_notification(notification)
                    email_notification_service.send_notification_email(
                        db,
                        user,
                        template_key=template_key,
                        context=context,
                    )

            notification.sent = True
        if due:
            db.commit()
            logger.info("Dispatched %d due notification(s)", len(due))
        return len(due)
