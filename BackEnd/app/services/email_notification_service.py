"""Granular email notification preferences and HTML email delivery."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from functools import lru_cache
from html import escape
from pathlib import Path
import re
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.constant import settings
from app.models.email_notification_preference import EmailNotificationPreference
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.user import User
from app.schemas.settings import EmailNotificationControls, EmailNotificationControlsUpdate
from app.services import email_service, settings_service

EmailTemplateKey = Literal[
    "verification_reminders",
    "password_changed_alert",
    "new_device_alert",
    "task_reminders",
    "today_plan_generated",
    "daily_motivational_quote",
    "daily_brief",
    "weekly_summary",
    "streak_risk_alert",
    "milestone_due_soon",
    "goal_target_risk",
    "daily_report_ready",
    "weekly_report_ready",
    "progress_coach_recommendations",
    "export_ready",
]

DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME = "07:00"
_HHMM_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_TEMPLATE_TOKEN_PATTERN = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}")
_EMAIL_TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates" / "email"


@lru_cache(maxsize=32)
def _load_email_template(template_name: str) -> str:
    template_path = _EMAIL_TEMPLATE_DIR / template_name
    return template_path.read_text(encoding="utf-8")


def _render_email_template(template_name: str, context: dict[str, str]) -> str:
    template = _load_email_template(template_name)

    def _replace_placeholder(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in context:
            raise KeyError(f"Missing template placeholder '{key}' in '{template_name}'")
        return context[key]

    return _TEMPLATE_TOKEN_PATTERN.sub(_replace_placeholder, template)


@dataclass(frozen=True)
class _TemplateSpec:
    badge: str
    title: str
    intro: str
    highlights: tuple[tuple[str, str], ...]
    items: tuple[tuple[str, str, str], ...]
    footer: str


_TEMPLATE_SPECS: dict[EmailTemplateKey, _TemplateSpec] = {
    "verification_reminders": _TemplateSpec(
        badge="Account Security",
        title="Verify your email to secure your account",
        intro="Verifying your email keeps account recovery and security alerts reliable.",
        highlights=(("Status", "Pending verification"), ("Time needed", "Under 20 seconds")),
        items=(
            ("Recovery safety", "Password recovery relies on verified email.", "Important"),
            ("Critical notices", "Security alerts are delivered to your inbox.", "Recommended"),
            ("Trust signals", "Verified accounts have stronger integrity checks.", "Automatic"),
        ),
        footer="This email is required for account security and verification.",
    ),
    "password_changed_alert": _TemplateSpec(
        badge="Security Alert",
        title="Password changed successfully",
        intro="Your Shadow password was updated. Review activity if this was unexpected.",
        highlights=(("Event", "Password updated"), ("Risk", "Low when expected")),
        items=(
            ("Review sessions", "Check active devices and revoke unknown sessions.", "2 min"),
            ("Confirm backup email", "Ensure recovery email is still correct.", "1 min"),
            ("Enable MFA", "Add extra sign-in protection if available.", "Optional"),
        ),
        footer="If you did not make this change, rotate credentials immediately.",
    ),
    "new_device_alert": _TemplateSpec(
        badge="Security Alert",
        title="New device connected to your account",
        intro="A new device was used for your Shadow account recently.",
        highlights=(("Detection", "New device sign-in"), ("Action", "Review sessions")),
        items=(
            ("Confirm device", "Verify this sign-in belongs to you.", "Immediate"),
            ("Revoke unknown access", "Sign out any unexpected sessions.", "Priority"),
            ("Update password", "Reset password if account access is uncertain.", "Recommended"),
        ),
        footer="Ignore this email if you recognize the new device.",
    ),
    "task_reminders": _TemplateSpec(
        badge="Planning Reminder",
        title="Upcoming task reminder",
        intro="A planned task is due soon. Prepare context now and start on time.",
        highlights=(("Focus", "Execution block"), ("Intent", "Close one meaningful loop")),
        items=(
            ("Open resources", "Keep docs and checklist ready before start.", "Now"),
            ("Define output", "Lock one concrete deliverable.", "2 min"),
            ("Protect focus", "Mute distractions during the task window.", "Recommended"),
        ),
        footer="Task reminders follow your planning settings and schedule.",
    ),
    "today_plan_generated": _TemplateSpec(
        badge="Daily Planning",
        title="Today's plan is ready",
        intro="Your AI-generated plan is prepared with focused blocks for execution.",
        highlights=(("Mode", "AI generated"), ("Goal", "High-impact execution")),
        items=(
            ("Start strong", "Begin with your highest-leverage task.", "Morning"),
            ("Preserve momentum", "Keep transitions short between blocks.", "All day"),
            ("Reflect quickly", "Close with a one-minute review.", "Evening"),
        ),
        footer="You can regenerate your plan anytime from the planner workspace.",
    ),
    "daily_motivational_quote": _TemplateSpec(
        badge="Daily Motivation",
        title="Your daily momentum reset",
        intro="Small, consistent actions compound faster than occasional intensity.",
        highlights=(("Focus", "Progress over perfection"), ("Move", "One meaningful action first")),
        items=(
            ("Pick one outcome", "Choose one result that must happen today.", "1 min"),
            ("Start now", "Take the smallest next step immediately.", "Immediate"),
            ("Close the loop", "Finish one high-impact block before noon.", "Priority"),
        ),
        footer="You can adjust your motivation email timing in Email Controls.",
    ),
    "daily_brief": _TemplateSpec(
        badge="Daily Brief",
        title="Your daily brief is ready",
        intro="Here is a concise snapshot to align priorities and execution.",
        highlights=(("Priority blocks", "3"), ("Carry forward", "1 item")),
        items=(
            ("Anchor task", "Complete your toughest task before noon.", "High impact"),
            ("Support task", "Move one dependency that unblocks progress.", "Important"),
            ("Quick close", "Review wins and misses in one line tonight.", "2 min"),
        ),
        footer="Daily brief content adapts to your recent planning behavior.",
    ),
    "weekly_summary": _TemplateSpec(
        badge="Weekly Summary",
        title="Your weekly summary is ready",
        intro="Review progress trends and set the next week's strongest focus.",
        highlights=(("Week health", "Momentum maintained"), ("Direction", "Execution-first")),
        items=(
            ("Biggest win", "Capture one repeatable pattern that worked.", "Retain"),
            ("Biggest leak", "Identify one drag to eliminate next week.", "Fix"),
            ("Next commitment", "Define two non-negotiable focus blocks.", "Plan"),
        ),
        footer="Weekly summaries are generated from your goals, tasks, and journals.",
    ),
    "streak_risk_alert": _TemplateSpec(
        badge="Streak Alert",
        title="Your streak is at risk",
        intro="One small action today can preserve momentum.",
        highlights=(("Status", "Streak risk detected"), ("Recovery", "1 completed block")),
        items=(
            ("Minimum viable win", "Finish one focused 25-minute sprint.", "Today"),
            ("Lower friction", "Start with the easiest visible step.", "Immediate"),
            ("Mark completion", "Log progress before day ends.", "Before sleep"),
        ),
        footer="Streak alerts are sent only when action can still recover momentum.",
    ),
    "milestone_due_soon": _TemplateSpec(
        badge="Milestone Alert",
        title="Milestone due soon",
        intro="An active milestone deadline is approaching.",
        highlights=(("Urgency", "High"), ("Focus", "Finish sprint")),
        items=(
            ("Freeze scope", "Pause low-impact additions until completion.", "Now"),
            ("Resolve blockers", "Assign ownership for each dependency.", "Today"),
            ("Protect time", "Reserve one uninterrupted deep-work block.", "Priority"),
        ),
        footer="Milestone reminders are based on deadlines and completion trend.",
    ),
    "goal_target_risk": _TemplateSpec(
        badge="Goal Risk",
        title="Goal target risk detected",
        intro="Current progress trend may miss your target date unless adjusted.",
        highlights=(("Signal", "Behind trajectory"), ("Action", "Correct this week")),
        items=(
            ("Re-prioritize", "Move one low-impact task out of this week.", "Immediate"),
            ("Increase cadence", "Add one extra deep-work session.", "Recommended"),
            ("Track signal", "Review progress metric each evening.", "5 min/day"),
        ),
        footer="Risk detection uses velocity versus target-date trajectory.",
    ),
    "daily_report_ready": _TemplateSpec(
        badge="Daily Report",
        title="Your daily report is ready",
        intro="Today's performance summary and AI insights are available.",
        highlights=(("Coverage", "Tasks, goals, and metrics"), ("View", "Reports workspace")),
        items=(
            ("Top insight", "Use the strongest recommendation first tomorrow.", "High leverage"),
            ("Pattern", "Identify one behavior to repeat.", "Retain"),
            ("Correction", "Choose one inefficiency to remove.", "Improve"),
        ),
        footer="Daily reports are generated from your latest progress data.",
    ),
    "weekly_report_ready": _TemplateSpec(
        badge="Weekly Report",
        title="Your weekly report is ready",
        intro="A week-level breakdown with trends and next-step guidance is available.",
        highlights=(("Coverage", "Weekly performance"), ("View", "Reports workspace")),
        items=(
            ("What worked", "Double down on the highest-yield behavior.", "Strength"),
            ("What slipped", "Address one recurring bottleneck.", "Gap"),
            ("Next-week anchor", "Protect two morning deep-work blocks.", "Plan"),
        ),
        footer="Weekly reports compare trend direction against recent history.",
    ),
    "progress_coach_recommendations": _TemplateSpec(
        badge="Progress Coach",
        title="New coach recommendations",
        intro="AI suggestions are ready to improve your execution rhythm.",
        highlights=(("Recommendation count", "3"), ("Impact", "High")),
        items=(
            ("Morning anchor", "Start with one non-negotiable block.", "Behavioral"),
            ("Context control", "Batch similar tasks to reduce switching.", "Operational"),
            ("Feedback loop", "Log one-line reflection daily.", "Compounding"),
        ),
        footer="Recommendations are generated from your activity signals.",
    ),
    "export_ready": _TemplateSpec(
        badge="Data Export",
        title="Your account export is ready",
        intro="The requested export package has been prepared.",
        highlights=(("Format", "ZIP"), ("Availability", "Limited retention window")),
        items=(
            ("Store securely", "Save the file only in trusted locations.", "Important"),
            ("Encrypt locally", "Use device encryption where possible.", "Recommended"),
            ("Cleanup", "Delete stale copies after use.", "Good practice"),
        ),
        footer="If this request was unexpected, review account security immediately.",
    ),
}


def _sanitize_hhmm(value: str | None, fallback: str = DEFAULT_DAILY_MOTIVATIONAL_QUOTE_TIME) -> str:
    candidate = (value or "").strip()
    if _HHMM_PATTERN.fullmatch(candidate):
        return candidate
    return fallback


def _frontend_url(path: str) -> str:
    base = (settings.public_frontend_base_url or "http://localhost:5173").rstrip("/")
    return f"{base}/{path.lstrip('/')}"


def _get_or_create_preferences(db: Session, user: User) -> EmailNotificationPreference:
    row = db.scalar(
        select(EmailNotificationPreference).where(EmailNotificationPreference.user_id == user.id)
    )
    if row is not None:
        return row

    row = EmailNotificationPreference(user_id=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _to_controls(row: EmailNotificationPreference) -> EmailNotificationControls:
    return EmailNotificationControls(
        verification_reminders=row.verification_reminders,
        password_changed_alert=row.password_changed_alert,
        new_device_alert=row.new_device_alert,
        task_reminders=row.task_reminders,
        today_plan_generated=row.today_plan_generated,
        daily_motivational_quote=row.daily_motivational_quote,
        daily_motivational_quote_time=_sanitize_hhmm(row.daily_motivational_quote_time),
        daily_brief=row.daily_brief,
        weekly_summary=row.weekly_summary,
        streak_risk_alert=row.streak_risk_alert,
        milestone_due_soon=row.milestone_due_soon,
        goal_target_risk=row.goal_target_risk,
        daily_report_ready=row.daily_report_ready,
        weekly_report_ready=row.weekly_report_ready,
        progress_coach_recommendations=row.progress_coach_recommendations,
        export_ready=row.export_ready,
    )


def get_email_notification_controls(db: Session, user: User) -> EmailNotificationControls:
    row = _get_or_create_preferences(db, user)
    return _to_controls(row)


def update_email_notification_controls(
    db: Session,
    user: User,
    data: EmailNotificationControlsUpdate,
) -> EmailNotificationControls:
    row = _get_or_create_preferences(db, user)
    updates = data.model_dump(exclude_unset=True)

    if "daily_motivational_quote_time" in updates:
        updates["daily_motivational_quote_time"] = _sanitize_hhmm(
            updates["daily_motivational_quote_time"],
            fallback=row.daily_motivational_quote_time,
        )

    for field, value in updates.items():
        setattr(row, field, value)

    # Keep legacy notification flags aligned where fields overlap.
    settings_row = settings_service.get_user_settings_row(db, user)
    if "task_reminders" in updates:
        settings_row.reminder_notifications_enabled = bool(updates["task_reminders"])
    if "daily_brief" in updates:
        settings_row.daily_brief_enabled = bool(updates["daily_brief"])
    if "weekly_summary" in updates:
        settings_row.weekly_summary_enabled = bool(updates["weekly_summary"])

    db.commit()
    db.refresh(row)
    return _to_controls(row)


def sync_with_notification_settings(
    db: Session,
    user: User,
    *,
    task_reminders: bool | None = None,
    daily_brief: bool | None = None,
    weekly_summary: bool | None = None,
) -> None:
    if task_reminders is None and daily_brief is None and weekly_summary is None:
        return

    row = _get_or_create_preferences(db, user)
    if task_reminders is not None:
        row.task_reminders = bool(task_reminders)
    if daily_brief is not None:
        row.daily_brief = bool(daily_brief)
    if weekly_summary is not None:
        row.weekly_summary = bool(weekly_summary)


def is_template_enabled(db: Session, user: User, template_key: EmailTemplateKey) -> bool:
    settings_row = settings_service.get_user_settings_row(db, user)
    if not settings_row.notifications_enabled:
        return False
    if not settings_row.email_notifications_enabled:
        return False

    row = _get_or_create_preferences(db, user)
    return bool(getattr(row, template_key))


def send_notification_email(
    db: Session,
    user: User,
    *,
    template_key: EmailTemplateKey,
    context: dict[str, Any] | None = None,
    force: bool = False,
) -> bool:
    if not force and not is_template_enabled(db, user, template_key):
        return False

    subject, text_body, html_body = _render_template(
        template_key=template_key,
        recipient_name=user.name,
        context=context or {},
    )
    return email_service.send_email(
        to_email=user.email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


def resolve_template_key_for_notification(notification: Notification) -> EmailTemplateKey | None:
    title = (notification.title or "").strip().lower()

    if notification.type == NotificationType.reminder and title.startswith("task reminder"):
        return "task_reminders"
    if title.startswith("daily brief"):
        return "daily_brief"
    if title.startswith("weekly summary"):
        return "weekly_summary"
    if title.startswith("daily report ready"):
        return "daily_report_ready"
    if title.startswith("weekly report ready"):
        return "weekly_report_ready"
    if "streak" in title and "risk" in title:
        return "streak_risk_alert"
    if "milestone" in title and "due" in title:
        return "milestone_due_soon"
    if "goal" in title and "risk" in title:
        return "goal_target_risk"
    if title.startswith("progress coach"):
        return "progress_coach_recommendations"
    if "export" in title and "ready" in title:
        return "export_ready"
    if "verification" in title:
        return "verification_reminders"

    return None


def context_from_notification(notification: Notification) -> dict[str, Any]:
    return {
        "notification_title": notification.title,
        "notification_body": notification.body,
    }


def _render_template(
    *,
    template_key: EmailTemplateKey,
    recipient_name: str,
    context: dict[str, Any],
) -> tuple[str, str, str]:
    safe_name = recipient_name.strip() or "Shadow User"
    spec = _TEMPLATE_SPECS[template_key]

    subject = spec.title
    highlights = list(spec.highlights)
    items = list(spec.items)
    quote: tuple[str, str] | None = None
    cta_label = "Open Shadow"
    cta_url = _frontend_url("")

    if template_key == "verification_reminders":
        verification_url = str(context.get("verification_url") or _frontend_url("settings/account"))
        expires_minutes = int(context.get("expires_minutes") or 24 * 60)
        subject = "Verify your Shadow account email"
        highlights = [("Verification link", "Ready"), ("Expires in", f"{expires_minutes} minutes")]
        cta_label = "Verify email"
        cta_url = verification_url
        items = [
            ("One-click verify", "Open the verification link to activate trusted delivery.", "Now"),
            ("Recovery readiness", "Verified email keeps password recovery reliable.", "Important"),
            ("Security posture", "Critical alerts stay actionable and timely.", "Automatic"),
        ]
    elif template_key == "task_reminders":
        task_title = str(context.get("task_title") or context.get("notification_title") or "Upcoming task")
        if task_title.lower().startswith("task reminder:"):
            task_title = task_title.split(":", 1)[1].strip() or "Upcoming task"
        scheduled_for = str(context.get("scheduled_for") or "Soon")
        subject = f"Task reminder: {task_title}"
        highlights = [("Task", task_title), ("Scheduled", scheduled_for)]
        cta_label = "Open planner"
        cta_url = _frontend_url("planner")
    elif template_key == "today_plan_generated":
        plan_date = str(context.get("plan_date") or date.today().isoformat())
        task_titles = [str(item) for item in context.get("task_titles") or []]
        subject = "Today's generated plan is ready"
        highlights = [("Plan date", plan_date), ("Tasks generated", str(max(1, len(task_titles))))]
        if task_titles:
            items = [
                (title, "Generated by Shadow planning engine.", "Planned")
                for title in task_titles[:5]
            ]
        quote_text = str(
            context.get("quote")
            or "Consistency compounds. Start with one meaningful block and build momentum."
        )
        quote_author = str(context.get("quote_author") or "Shadow")
        quote = (quote_text, quote_author)
        cta_label = "Open today's plan"
        cta_url = _frontend_url("plan")
    elif template_key == "daily_motivational_quote":
        quote_text = str(
            context.get("quote")
            or "Discipline is choosing what you want most over what you want now."
        )
        quote_author = str(context.get("quote_author") or "Abraham Lincoln")
        quote = (quote_text, quote_author)
        subject = "Your daily momentum reset"
        highlights = [("Date", datetime.now(timezone.utc).date().isoformat()), ("Mode", "Daily motivation")]
        cta_label = "Open workspace"
        cta_url = _frontend_url("plan")
    elif template_key == "daily_brief":
        subject = "Your daily brief is ready"
        cta_label = "Open daily brief"
        cta_url = _frontend_url("dashboard")
    elif template_key == "weekly_summary":
        subject = "Your weekly summary is ready"
        cta_label = "Open weekly summary"
        cta_url = _frontend_url("dashboard")
    elif template_key == "daily_report_ready":
        report_path = str(context.get("report_path") or "").strip()
        subject = "Your daily report is ready"
        cta_label = "Open report"
        cta_url = _frontend_url(report_path) if report_path else _frontend_url("reports")
    elif template_key == "weekly_report_ready":
        report_path = str(context.get("report_path") or "").strip()
        subject = "Your weekly report is ready"
        cta_label = "Open report"
        cta_url = _frontend_url(report_path) if report_path else _frontend_url("reports")
    elif template_key == "export_ready":
        subject = "Your account export is ready"
        exported_at = str(context.get("exported_at") or datetime.now(timezone.utc).isoformat())
        highlights = [("Status", "Ready"), ("Generated", exported_at)]
        cta_label = "Open account settings"
        cta_url = _frontend_url("settings")
    elif template_key == "new_device_alert":
        device_label = str(context.get("device_label") or "A new device")
        highlights = [("Event", "New device connected"), ("Device", device_label)]
        cta_label = "Secure My Account"
        cta_url = _frontend_url("settings/security")
    elif template_key == "password_changed_alert":
        changed_at = str(context.get("changed_at") or datetime.now(timezone.utc).strftime("%b %d, %Y %I:%M %p UTC"))
        highlights = [("Event", "Password changed"), ("At", changed_at)]
        cta_label = "Review security"
        cta_url = _frontend_url("settings/security")

    if template_key == "verification_reminders":
        return _render_verification_reminder_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            expires_minutes=int(context.get("expires_minutes") or 24 * 60),
            verification_url=str(context.get("verification_url") or cta_url),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "task_reminders":
        task_title = str(context.get("task_title") or context.get("notification_title") or "Upcoming task")
        if task_title.lower().startswith("task reminder:"):
            task_title = task_title.split(":", 1)[1].strip() or "Upcoming task"
        return _render_task_reminder_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            task_title=task_title,
            scheduled_for=str(context.get("scheduled_for") or "Soon"),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "today_plan_generated":
        plan_date = str(context.get("plan_date") or date.today().isoformat())
        raw_tasks = context.get("tasks") or []
        task_cards: list[dict[str, str]] = []
        for raw in raw_tasks[:8]:
            if not isinstance(raw, dict):
                continue
            title = str(raw.get("title") or "Planned task").strip()
            if not title:
                title = "Planned task"
            task_cards.append(
                {
                    "title": title,
                    "why_today": str(raw.get("why_today") or "Focus on one meaningful step today.").strip(),
                    "impact_if_skipped": str(raw.get("impact_if_skipped") or "Skipping may reduce progress momentum.").strip(),
                    "goal_linked": str(raw.get("goal_linked") or "General growth").strip(),
                    "remaining": str(raw.get("remaining") or "Not set").strip(),
                    "priority": str(raw.get("priority") or "Medium").strip().title(),
                    "badge": str(raw.get("badge") or "Plan").strip().title(),
                    "due": str(raw.get("due") or "Due today").strip(),
                }
            )

        if not task_cards:
            task_titles = [str(item).strip() for item in context.get("task_titles") or [] if str(item).strip()]
            task_cards = [
                {
                    "title": title,
                    "why_today": "Keep momentum with a focused execution block.",
                    "impact_if_skipped": "Skipping may reduce progress momentum.",
                    "goal_linked": "General growth",
                    "remaining": "Not set",
                    "priority": "Medium",
                    "badge": "Plan",
                    "due": "Due today",
                }
                for title in task_titles[:8]
            ]

        if not task_cards:
            task_cards = [
                {
                    "title": "Your first focus block",
                    "why_today": "Start with one meaningful action to build momentum.",
                    "impact_if_skipped": "Skipping may delay your daily execution rhythm.",
                    "goal_linked": "General growth",
                    "remaining": "Not set",
                    "priority": "Medium",
                    "badge": "Plan",
                    "due": "Due today",
                }
            ]

        tasks_generated = str(len(task_cards))
        focus_note = str(
            context.get("quote")
            or "Consistency compounds. Start with one meaningful block and build momentum."
        )
        return _render_today_plan_generated_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            plan_date=plan_date,
            tasks_generated=tasks_generated,
            task_cards=tuple(task_cards),
            focus_note=focus_note,
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "daily_motivational_quote":
        quote_text = str(
            context.get("quote")
            or "Discipline is choosing what you want most over what you want now."
        )
        quote_author = str(context.get("quote_author") or "Abraham Lincoln")
        return _render_daily_motivational_quote_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            quote_text=quote_text,
            quote_author=quote_author,
            quote_date=str(context.get("quote_date") or datetime.now(timezone.utc).date().isoformat()),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "daily_brief":
        priority_blocks = str(context.get("priority_blocks") or context.get("priority_block_count") or "3")
        carry_forward_raw = context.get("carry_forward") or context.get("carry_forward_count")
        if carry_forward_raw is None:
            carry_forward = "1 item"
        else:
            carry_forward_value = str(carry_forward_raw).strip()
            if carry_forward_value.isdigit():
                carry_forward = f"{carry_forward_value} item" if carry_forward_value == "1" else f"{carry_forward_value} items"
            else:
                carry_forward = carry_forward_value
        return _render_daily_brief_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            priority_blocks=priority_blocks,
            carry_forward=carry_forward,
            anchor_task=str(context.get("anchor_task") or "Complete your toughest task before noon."),
            support_task=str(context.get("support_task") or "Move one dependency that unlocks progress."),
            quick_close=str(context.get("quick_close") or "Review wins and misses in one line tonight."),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "weekly_summary":
        return _render_weekly_summary_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            week_health=str(context.get("week_health") or "Momentum maintained"),
            direction=str(context.get("direction") or "Execution-first"),
            biggest_win=str(context.get("biggest_win") or "Capture one repeatable pattern that worked."),
            biggest_leak=str(context.get("biggest_leak") or "Identify one drag to eliminate next week."),
            next_commitment=str(context.get("next_commitment") or "Define two non-negotiable focus blocks."),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "streak_risk_alert":
        return _render_streak_risk_alert_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            status=str(context.get("status") or "Streak risk detected"),
            recovery=str(context.get("recovery") or "1 completed block"),
            minimum_viable_win=str(context.get("minimum_viable_win") or "Finish one focused 25-minute sprint."),
            lower_friction=str(context.get("lower_friction") or "Start with the easiest visible step."),
            mark_completion=str(context.get("mark_completion") or "Log progress before day ends."),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "milestone_due_soon":
        return _render_milestone_due_soon_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            urgency=str(context.get("urgency") or "High"),
            focus=str(context.get("focus") or "Finish sprint"),
            freeze_scope=str(context.get("freeze_scope") or "Pause low-impact additions until completion."),
            resolve_blockers=str(context.get("resolve_blockers") or "Assign ownership for each dependency."),
            protect_time=str(context.get("protect_time") or "Reserve one uninterrupted deep-work block."),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "goal_target_risk":
        return _render_goal_target_risk_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            signal=str(context.get("signal") or "Behind trajectory"),
            action=str(context.get("action") or "Correct this week"),
            reprioritize=str(context.get("reprioritize") or "Move one low-impact task out of this week."),
            increase_cadence=str(context.get("increase_cadence") or "Add one extra deep-work session."),
            track_signal=str(context.get("track_signal") or "Review progress metric each evening."),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "progress_coach_recommendations":
        return _render_progress_coach_recommendations_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            recommendation_count=str(context.get("recommendation_count") or "3"),
            impact=str(context.get("impact") or "High"),
            morning_anchor=str(context.get("morning_anchor") or "Start with one non-negotiable block."),
            context_control=str(context.get("context_control") or "Batch similar tasks to reduce switching."),
            feedback_loop=str(context.get("feedback_loop") or "Log one-line reflection daily."),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key in {"daily_report_ready", "weekly_report_ready"}:
        period_label = "Weekly" if template_key == "weekly_report_ready" else "Daily"
        metrics_payload = context.get("metric_rows")
        metric_rows = metrics_payload if isinstance(metrics_payload, list) else []
        tasks_planned_raw = context.get("tasks_planned")
        tasks_completed_raw = context.get("tasks_completed")
        tasks_planned = int(tasks_planned_raw) if isinstance(tasks_planned_raw, int | float) else 0
        tasks_completed = int(tasks_completed_raw) if isinstance(tasks_completed_raw, int | float) else 0
        date_range = str(context.get("date_range") or "Current period")
        template_name = "weekly_report_ready.html" if template_key == "weekly_report_ready" else "daily_report_ready.html"
        return _render_report_ready_shell(
            template_name=template_name,
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            period_label=period_label,
            date_range=date_range,
            tasks_planned=tasks_planned,
            tasks_completed=tasks_completed,
            metric_rows=tuple(metric_rows),
            narrative=str(context.get("narrative") or ""),
            next_steps=str(context.get("next_steps") or ""),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "password_changed_alert":
        return _render_password_changed_alert_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            changed_at=str(context.get("changed_at") or datetime.now(timezone.utc).strftime("%b %d, %Y %I:%M %p UTC")),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    if template_key == "new_device_alert":
        return _render_new_device_alert_shell(
            subject=subject,
            recipient_name=safe_name,
            title=str(context.get("notification_title") or spec.title),
            intro=str(context.get("notification_body") or spec.intro),
            device_label=str(context.get("device_label") or "Current browser session"),
            browser=str(context.get("browser") or "Unknown browser"),
            operating_system=str(context.get("operating_system") or "Unknown OS"),
            location=str(context.get("location") or "Unknown location"),
            detected_at=str(context.get("detected_at") or datetime.now(timezone.utc).strftime("%b %d, %Y %I:%M %p UTC")),
            ip_address=str(context.get("ip_address") or "Unavailable"),
            cta_label=str(context.get("cta_label") or cta_label),
            cta_url=cta_url,
            footer=spec.footer,
            support_email=str(context.get("support_email") or "support@shadow.app"),
        )

    title = context.get("notification_title") or spec.title
    intro = context.get("notification_body") or spec.intro

    return _render_shell(
        subject=subject,
        recipient_name=safe_name,
        badge=spec.badge,
        title=str(title),
        intro=str(intro),
        highlights=tuple((str(label), str(value)) for label, value in highlights),
        items=tuple((str(item_title), str(detail), str(meta)) for item_title, detail, meta in items),
        footer=spec.footer,
        cta_label=cta_label,
        cta_url=cta_url,
        quote=quote,
    )


def _render_verification_reminder_shell(
        *,
        subject: str,
        recipient_name: str,
        title: str,
        intro: str,
        expires_minutes: int,
        verification_url: str,
        cta_label: str,
        cta_url: str,
        footer: str,
        support_email: str,
) -> tuple[str, str, str]:
        text_lines = [
                f"Hi {recipient_name},",
                "",
                intro,
                "",
                "Verification details:",
                "- Link status: Ready",
                f"- Expires in: {expires_minutes} minutes",
                "",
                "Why verify now:",
                "- Keep password recovery reliable",
                "- Receive critical account alerts",
                "- Maintain account security trust",
                "",
                f"Verify now: {verification_url}",
                "",
                f"Need help? Contact support at {support_email}",
                "",
                footer,
                "",
                "Team Shadow",
        ]
        text_body = "\n".join(text_lines)

        safe_subject = escape(subject)
        safe_name = escape(recipient_name)
        safe_title = escape(title)
        safe_intro = escape(intro)
        safe_expires_minutes = escape(str(expires_minutes))
        safe_verification_url = escape(verification_url)
        safe_cta_label = escape(cta_label)
        safe_cta_url = escape(cta_url)
        safe_footer = escape(footer)
        safe_support_email = escape(support_email)

        html_body = _render_email_template(
            "verification_reminder.html",
            {
                "safe_subject": safe_subject,
                "safe_name": safe_name,
                "safe_title": safe_title,
                "safe_intro": safe_intro,
                "safe_expires_minutes": safe_expires_minutes,
                "safe_verification_url": safe_verification_url,
                "safe_cta_label": safe_cta_label,
                "safe_cta_url": safe_cta_url,
                "safe_footer": safe_footer,
                "safe_support_email": safe_support_email,
            },
        )

        return subject, text_body, html_body


def _render_task_reminder_shell(
        *,
        subject: str,
        recipient_name: str,
        title: str,
        intro: str,
        task_title: str,
        scheduled_for: str,
        cta_label: str,
        cta_url: str,
        footer: str,
        support_email: str,
) -> tuple[str, str, str]:
        text_lines = [
                f"Hi {recipient_name},",
                "",
                intro,
                "",
                "Task reminder details:",
                f"- Task: {task_title}",
                f"- Scheduled: {scheduled_for}",
                "",
                "Quick execution plan:",
                "- Open your planner",
                "- Start with one focused block",
                "- Mark completion to keep momentum",
                "",
                f"Open: {cta_url}",
                "",
                f"Need help? Contact support at {support_email}",
                "",
                footer,
                "",
                "Team Shadow",
        ]
        text_body = "\n".join(text_lines)

        safe_subject = escape(subject)
        safe_name = escape(recipient_name)
        safe_title = escape(title)
        safe_intro = escape(intro)
        safe_task_title = escape(task_title)
        safe_scheduled_for = escape(scheduled_for)
        safe_cta_label = escape(cta_label)
        safe_cta_url = escape(cta_url)
        safe_footer = escape(footer)
        safe_support_email = escape(support_email)

        html_body = _render_email_template(
            "task_reminder.html",
            {
                "safe_subject": safe_subject,
                "safe_name": safe_name,
                "safe_title": safe_title,
                "safe_intro": safe_intro,
                "safe_task_title": safe_task_title,
                "safe_scheduled_for": safe_scheduled_for,
                "safe_cta_label": safe_cta_label,
                "safe_cta_url": safe_cta_url,
                "safe_footer": safe_footer,
                "safe_support_email": safe_support_email,
            },
        )

        return subject, text_body, html_body


def _render_daily_brief_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    priority_blocks: str,
    carry_forward: str,
    anchor_task: str,
    support_task: str,
    quick_close: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Daily brief snapshot:",
        f"- Priority blocks: {priority_blocks}",
        f"- Carry forward: {carry_forward}",
        "",
        "Execution plan:",
        f"- Anchor task: {anchor_task}",
        f"- Support task: {support_task}",
        f"- Quick close: {quick_close}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ]
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_priority_blocks = escape(priority_blocks)
    safe_carry_forward = escape(carry_forward)
    safe_anchor_task = escape(anchor_task)
    safe_support_task = escape(support_task)
    safe_quick_close = escape(quick_close)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "daily_brief.html",
        {
        "safe_subject": safe_subject,
        "safe_name": safe_name,
        "safe_title": safe_title,
        "safe_intro": safe_intro,
        "safe_priority_blocks": safe_priority_blocks,
        "safe_carry_forward": safe_carry_forward,
        "safe_anchor_task": safe_anchor_task,
        "safe_support_task": safe_support_task,
        "safe_quick_close": safe_quick_close,
        "safe_cta_label": safe_cta_label,
        "safe_cta_url": safe_cta_url,
        "safe_footer": safe_footer,
        "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_weekly_summary_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    week_health: str,
    direction: str,
    biggest_win: str,
    biggest_leak: str,
    next_commitment: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Weekly summary snapshot:",
        f"- Week health: {week_health}",
        f"- Direction: {direction}",
        "",
        "Execution plan:",
        f"- Biggest win: {biggest_win}",
        f"- Biggest leak: {biggest_leak}",
        f"- Next commitment: {next_commitment}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ]
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_week_health = escape(week_health)
    safe_direction = escape(direction)
    safe_biggest_win = escape(biggest_win)
    safe_biggest_leak = escape(biggest_leak)
    safe_next_commitment = escape(next_commitment)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "weekly_summary.html",
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_week_health": safe_week_health,
            "safe_direction": safe_direction,
            "safe_biggest_win": safe_biggest_win,
            "safe_biggest_leak": safe_biggest_leak,
            "safe_next_commitment": safe_next_commitment,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_streak_risk_alert_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    status: str,
    recovery: str,
    minimum_viable_win: str,
    lower_friction: str,
    mark_completion: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Streak risk snapshot:",
        f"- Status: {status}",
        f"- Recovery: {recovery}",
        "",
        "Execution plan:",
        f"- Minimum viable win: {minimum_viable_win}",
        f"- Lower friction: {lower_friction}",
        f"- Mark completion: {mark_completion}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ]
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_status = escape(status)
    safe_recovery = escape(recovery)
    safe_minimum_viable_win = escape(minimum_viable_win)
    safe_lower_friction = escape(lower_friction)
    safe_mark_completion = escape(mark_completion)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "streak_risk_alert.html",
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_status": safe_status,
            "safe_recovery": safe_recovery,
            "safe_minimum_viable_win": safe_minimum_viable_win,
            "safe_lower_friction": safe_lower_friction,
            "safe_mark_completion": safe_mark_completion,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_milestone_due_soon_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    urgency: str,
    focus: str,
    freeze_scope: str,
    resolve_blockers: str,
    protect_time: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Milestone snapshot:",
        f"- Urgency: {urgency}",
        f"- Focus: {focus}",
        "",
        "Execution plan:",
        f"- Freeze scope: {freeze_scope}",
        f"- Resolve blockers: {resolve_blockers}",
        f"- Protect time: {protect_time}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ]
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_urgency = escape(urgency)
    safe_focus = escape(focus)
    safe_freeze_scope = escape(freeze_scope)
    safe_resolve_blockers = escape(resolve_blockers)
    safe_protect_time = escape(protect_time)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "milestone_due_soon.html",
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_urgency": safe_urgency,
            "safe_focus": safe_focus,
            "safe_freeze_scope": safe_freeze_scope,
            "safe_resolve_blockers": safe_resolve_blockers,
            "safe_protect_time": safe_protect_time,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_goal_target_risk_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    signal: str,
    action: str,
    reprioritize: str,
    increase_cadence: str,
    track_signal: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Goal risk snapshot:",
        f"- Signal: {signal}",
        f"- Action: {action}",
        "",
        "Execution plan:",
        f"- Re-prioritize: {reprioritize}",
        f"- Increase cadence: {increase_cadence}",
        f"- Track signal: {track_signal}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ]
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_signal = escape(signal)
    safe_action = escape(action)
    safe_reprioritize = escape(reprioritize)
    safe_increase_cadence = escape(increase_cadence)
    safe_track_signal = escape(track_signal)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "goal_target_risk.html",
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_signal": safe_signal,
            "safe_action": safe_action,
            "safe_reprioritize": safe_reprioritize,
            "safe_increase_cadence": safe_increase_cadence,
            "safe_track_signal": safe_track_signal,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_progress_coach_recommendations_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    recommendation_count: str,
    impact: str,
    morning_anchor: str,
    context_control: str,
    feedback_loop: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Progress coach snapshot:",
        f"- Recommendation count: {recommendation_count}",
        f"- Impact: {impact}",
        "",
        "Execution plan:",
        f"- Morning anchor: {morning_anchor}",
        f"- Context control: {context_control}",
        f"- Feedback loop: {feedback_loop}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ]
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_recommendation_count = escape(recommendation_count)
    safe_impact = escape(impact)
    safe_morning_anchor = escape(morning_anchor)
    safe_context_control = escape(context_control)
    safe_feedback_loop = escape(feedback_loop)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "progress_coach_recommendations.html",
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_recommendation_count": safe_recommendation_count,
            "safe_impact": safe_impact,
            "safe_morning_anchor": safe_morning_anchor,
            "safe_context_control": safe_context_control,
            "safe_feedback_loop": safe_feedback_loop,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_today_plan_generated_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    plan_date: str,
    tasks_generated: str,
    task_cards: tuple[dict[str, str], ...],
    focus_note: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Today's plan snapshot:",
        f"- Plan date: {plan_date}",
        f"- Tasks generated: {tasks_generated}",
        "",
        "Today's tasks:",
    ]
    for index, item in enumerate(task_cards, start=1):
        text_lines.extend(
            [
                f"- {index}. {item['title']}",
                f"  Why today: {item['why_today']}",
                f"  Impact if skipped: {item['impact_if_skipped']}",
                f"  Goal linked: {item['goal_linked']}",
                f"  Remaining: {item['remaining']}",
                f"  Priority: {item['priority']} | Badge: {item['badge']} | {item['due']}",
            ]
        )

    text_lines.extend([
        "",
        f"Focus note: {focus_note}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ])
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_plan_date = escape(plan_date)
    safe_tasks_generated = escape(tasks_generated)
    safe_task_cards_html_parts: list[str] = []
    for index, item in enumerate(task_cards, start=1):
        safe_title_item = escape(item.get("title", "Planned task"))
        safe_why_today = escape(item.get("why_today", "Focus on one meaningful step today."))
        safe_impact = escape(item.get("impact_if_skipped", "Skipping may reduce progress momentum."))
        safe_goal = escape(item.get("goal_linked", "General growth"))
        safe_remaining = escape(item.get("remaining", "Not set"))
        safe_priority = escape(item.get("priority", "Medium"))
        safe_badge = escape(item.get("badge", "Plan"))
        safe_due = escape(item.get("due", "Due today"))
        safe_task_cards_html_parts.append(
            "<tr><td style=\"padding:10px 40px 0;\">"
            "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;\">"
            "<tr><td style=\"padding:14px 16px;font-size:12px;line-height:1.55;color:#4b5563;\">"
            f"<div style=\"font-size:22px;color:#111827;font-weight:700;line-height:1.2;\">{index}. {safe_title_item}</div>"
            f"<div style=\"margin-top:8px;\"><span style=\"font-weight:700;color:#374151;\">Why today:</span> {safe_why_today}</div>"
            f"<div style=\"margin-top:4px;\"><span style=\"font-weight:700;color:#374151;\">Impact if skipped:</span> {safe_impact}</div>"
            f"<div style=\"margin-top:4px;\"><span style=\"font-weight:700;color:#374151;\">Goal linked:</span> {safe_goal}</div>"
            f"<div style=\"margin-top:4px;\"><span style=\"font-weight:700;color:#374151;\">Remaining:</span> {safe_remaining}</div>"
            "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"margin-top:10px;\"><tr>"
            f"<td align=\"left\" style=\"font-size:12px;color:#4b5563;\"><span style=\"display:inline-block;padding:2px 8px;border-radius:999px;background:#fff7ed;color:#9a3412;font-weight:700;\">{safe_priority}</span> <span style=\"display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;background:#ede9ff;color:#5f4bff;font-weight:700;\">{safe_badge}</span></td>"
            f"<td align=\"right\" style=\"font-size:12px;color:#6b7280;font-weight:700;\">{safe_due}</td>"
            "</tr></table>"
            "</td></tr></table>"
            "</td></tr>"
        )
    safe_task_cards_html = "".join(safe_task_cards_html_parts)
    safe_focus_note = escape(focus_note)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "today_plan_generated.html",
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_plan_date": safe_plan_date,
            "safe_tasks_generated": safe_tasks_generated,
            "safe_task_cards_html": safe_task_cards_html,
            "safe_focus_note": safe_focus_note,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_report_ready_shell(
    *,
    template_name: str,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    period_label: str,
    date_range: str,
    tasks_planned: int,
    tasks_completed: int,
    metric_rows: tuple[dict[str, Any], ...],
    narrative: str,
    next_steps: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    completion_percent = int((tasks_completed / tasks_planned) * 100) if tasks_planned > 0 else 0

    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Report summary:",
        f"- Period: {period_label}",
        f"- Date range: {date_range}",
        f"- Tasks completed: {tasks_completed}/{tasks_planned} ({completion_percent}%)",
        "",
        "Tracked metrics:",
    ]
    if metric_rows:
        for row in metric_rows[:10]:
            label = str(row.get("label") or "Metric")
            total = row.get("total")
            unit = str(row.get("unit") or "")
            target = row.get("target")
            if target is not None:
                text_lines.append(f"- {label}: {total} {unit} / {target} {unit}")
            else:
                text_lines.append(f"- {label}: {total} {unit}")
    else:
        text_lines.append("- No tracked metrics for this period.")

    if narrative.strip():
        text_lines.extend(["", "Summary:", narrative.strip()])
    if next_steps.strip():
        text_lines.extend(["", "Next steps:", next_steps.strip()])

    text_lines.extend([
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ])
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_period_label = escape(period_label)
    safe_date_range = escape(date_range)
    safe_tasks_completed = escape(str(tasks_completed))
    safe_tasks_planned = escape(str(tasks_planned))
    safe_completion_percent = max(0, min(completion_percent, 100))

    def _to_float(value: Any) -> float | None:
        if isinstance(value, int | float):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value.strip())
            except ValueError:
                return None
        return None

    metric_rows_html_parts: list[str] = []
    for row in metric_rows[:10]:
        label = escape(str(row.get("label") or "Metric"))
        total_raw = row.get("total") if row.get("total") is not None else 0
        total = escape(str(total_raw))
        unit = escape(str(row.get("unit") or ""))
        target = row.get("target")
        total_num = _to_float(total_raw)
        target_num = _to_float(target)
        progress_html = ""
        target_text = ""
        value_text = f"{total}{f' {unit}' if unit else ''}"
        if target_num is not None and target_num > 0:
            pct_base = (total_num or 0.0) / target_num
            pct = max(0, min(int(pct_base * 100), 100))
            target_text = f" / {escape(str(target))} {unit}"
            progress_html = (
                '<div style="margin-top:6px;background:#e5e7eb;border-radius:999px;height:5px;">'
                f'<div style="width:{pct}%;height:5px;border-radius:999px;background:#5f4bff;"></div>'
                "</div>"
            )
        metric_rows_html_parts.append(
            "<div style=\"margin-top:10px;\">"
            "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"font-size:12px;\">"
            "<tr>"
            f"<td style=\"font-weight:700;color:#111827;padding:0 8px 0 0;\">{label}</td>"
            f"<td align=\"right\" style=\"color:#4b5563;white-space:nowrap;\">{value_text}{target_text}</td>"
            "</tr>"
            "</table>"
            f"{progress_html}"
            "</div>"
        )
    safe_metric_rows_html = "".join(metric_rows_html_parts) or "<div style=\"font-size:12px;color:#4b5563;\">No tracked metrics for this period.</div>"

    safe_narrative_html = escape(narrative.strip()).replace("\n", "<br />") if narrative.strip() else ""
    safe_next_steps_html = escape(next_steps.strip()).replace("\n", "<br />") if next_steps.strip() else ""
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        template_name,
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_period_label": safe_period_label,
            "safe_date_range": safe_date_range,
            "safe_tasks_completed": safe_tasks_completed,
            "safe_tasks_planned": safe_tasks_planned,
            "safe_completion_percent": str(safe_completion_percent),
            "safe_metric_rows_html": safe_metric_rows_html,
            "safe_narrative_html": safe_narrative_html,
            "safe_next_steps_html": safe_next_steps_html,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_daily_motivational_quote_shell(
    *,
    subject: str,
    recipient_name: str,
    title: str,
    intro: str,
    quote_text: str,
    quote_author: str,
    quote_date: str,
    cta_label: str,
    cta_url: str,
    footer: str,
    support_email: str,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Daily quote:",
        f'"{quote_text}"',
        f"- {quote_author}",
        "",
        f"Date: {quote_date}",
        "",
        f"Open: {cta_url}",
        "",
        f"Need help? Contact support at {support_email}",
        "",
        footer,
        "",
        "Team Shadow",
    ]
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_quote_text = escape(quote_text)
    safe_quote_author = escape(quote_author)
    safe_quote_date = escape(quote_date)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)
    safe_footer = escape(footer)
    safe_support_email = escape(support_email)

    html_body = _render_email_template(
        "daily_motivational_quote.html",
        {
            "safe_subject": safe_subject,
            "safe_name": safe_name,
            "safe_title": safe_title,
            "safe_intro": safe_intro,
            "safe_quote_text": safe_quote_text,
            "safe_quote_author": safe_quote_author,
            "safe_quote_date": safe_quote_date,
            "safe_cta_label": safe_cta_label,
            "safe_cta_url": safe_cta_url,
            "safe_footer": safe_footer,
            "safe_support_email": safe_support_email,
        },
    )

    return subject, text_body, html_body


def _render_password_changed_alert_shell(
        *,
        subject: str,
        recipient_name: str,
        title: str,
        intro: str,
        changed_at: str,
        cta_label: str,
        cta_url: str,
        footer: str,
        support_email: str,
) -> tuple[str, str, str]:
        text_lines = [
                f"Hi {recipient_name},",
                "",
                intro,
                "",
                "Password change details:",
                f"- Changed at: {changed_at}",
                "",
                "If this was you, no action is needed.",
                "If this wasn't you, secure your account immediately.",
                "",
                f"Open: {cta_url}",
                "",
                f"Need help? Contact support at {support_email}",
                "",
                footer,
                "",
                "Team Shadow",
        ]
        text_body = "\n".join(text_lines)

        safe_subject = escape(subject)
        safe_name = escape(recipient_name)
        safe_title = escape(title)
        safe_intro = escape(intro)
        safe_changed_at = escape(changed_at)
        safe_cta_label = escape(cta_label)
        safe_cta_url = escape(cta_url)
        safe_footer = escape(footer)
        safe_support_email = escape(support_email)
        safe_yes_url = escape(_frontend_url("notifications"))
        safe_no_url = escape(_frontend_url("settings/security"))

        html_body = _render_email_template(
            "password_changed_alert.html",
            {
                "safe_subject": safe_subject,
                "safe_name": safe_name,
                "safe_title": safe_title,
                "safe_intro": safe_intro,
                "safe_changed_at": safe_changed_at,
                "safe_cta_label": safe_cta_label,
                "safe_cta_url": safe_cta_url,
                "safe_footer": safe_footer,
                "safe_support_email": safe_support_email,
                "safe_yes_url": safe_yes_url,
                "safe_no_url": safe_no_url,
            },
        )

        return subject, text_body, html_body


def _render_new_device_alert_shell(
        *,
        subject: str,
        recipient_name: str,
        title: str,
        intro: str,
        device_label: str,
        browser: str,
        operating_system: str,
        location: str,
        detected_at: str,
        ip_address: str,
        cta_label: str,
        cta_url: str,
        footer: str,
        support_email: str,
) -> tuple[str, str, str]:
        text_lines = [
                f"Hi {recipient_name},",
                "",
                intro,
                "",
                "Device sign-in details:",
                f"- Device: {device_label}",
                f"- Browser: {browser}",
                f"- Operating system: {operating_system}",
                f"- Location: {location}",
                f"- Time: {detected_at}",
                f"- IP address: {ip_address}",
                "",
                "Was this you?",
                "- Yes, it was me -> no action needed.",
                "- No, this wasn't me -> secure your account now.",
                "",
                f"Open: {cta_url}",
                "",
                f"Need help? Contact support at {support_email}",
                "",
                footer,
                "",
                "Team Shadow",
        ]
        text_body = "\n".join(text_lines)

        safe_subject = escape(subject)
        safe_name = escape(recipient_name)
        safe_title = escape(title)
        safe_intro = escape(intro)
        safe_device_label = escape(device_label)
        safe_browser = escape(browser)
        safe_os = escape(operating_system)
        safe_location = escape(location)
        safe_detected_at = escape(detected_at)
        safe_ip = escape(ip_address)
        safe_cta_label = escape(cta_label)
        safe_cta_url = escape(cta_url)
        safe_footer = escape(footer)
        safe_support_email = escape(support_email)

        # Inline SVG icons render more reliably than emoji/glyph fallbacks.
        icon_device = (
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
            'xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">'
            '<rect x="3.5" y="4.5" width="17" height="12" rx="2" stroke="#6b5cff" stroke-width="1.8"/>'
            '<path d="M9 20h6" stroke="#6b5cff" stroke-width="1.8" stroke-linecap="round"/>'
            '<path d="M12 16.5v3" stroke="#6b5cff" stroke-width="1.8" stroke-linecap="round"/>'
            '</svg>'
        )
        icon_browser = (
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
            'xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">'
            '<circle cx="12" cy="12" r="8" stroke="#6b5cff" stroke-width="1.8"/>'
            '<path d="M4 12h16" stroke="#6b5cff" stroke-width="1.6"/>'
            '<path d="M12 4c2.8 2.3 2.8 13.7 0 16" stroke="#6b5cff" stroke-width="1.6"/>'
            '<path d="M12 4c-2.8 2.3-2.8 13.7 0 16" stroke="#6b5cff" stroke-width="1.6"/>'
            '</svg>'
        )
        icon_os = (
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
            'xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">'
            '<rect x="4" y="5" width="16" height="10" rx="2" stroke="#6b5cff" stroke-width="1.8"/>'
            '<path d="M2.5 19h19" stroke="#6b5cff" stroke-width="1.8" stroke-linecap="round"/>'
            '</svg>'
        )
        icon_location = (
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
            'xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">'
            '<path d="M12 21s6-5.8 6-10a6 6 0 1 0-12 0c0 4.2 6 10 6 10Z" stroke="#6b5cff" stroke-width="1.8"/>'
            '<circle cx="12" cy="11" r="2.2" stroke="#6b5cff" stroke-width="1.6"/>'
            '</svg>'
        )
        icon_time = (
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
            'xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">'
            '<circle cx="12" cy="12" r="8" stroke="#6b5cff" stroke-width="1.8"/>'
            '<path d="M12 8v4.2l3 1.8" stroke="#6b5cff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
            '</svg>'
        )
        icon_ip = (
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" '
            'xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;">'
            '<circle cx="6" cy="6" r="2" stroke="#6b5cff" stroke-width="1.6"/>'
            '<circle cx="18" cy="6" r="2" stroke="#6b5cff" stroke-width="1.6"/>'
            '<circle cx="6" cy="18" r="2" stroke="#6b5cff" stroke-width="1.6"/>'
            '<circle cx="18" cy="18" r="2" stroke="#6b5cff" stroke-width="1.6"/>'
            '<path d="M8 6h8M6 8v8M18 8v8M8 18h8" stroke="#6b5cff" stroke-width="1.4"/>'
            '</svg>'
        )
        icon_lock_cta = (
            '<svg width="15" height="15" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" '
            'style="vertical-align:-2px;margin-right:7px;fill:#5e50ff;">'
            '<path d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3Zm-2 5V4a2 2 0 1 1 4 0v2H6Z"/>'
            '</svg>'
        )
        icon_arrow_cta = (
            '<svg width="15" height="15" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" '
            'style="vertical-align:-2px;margin-left:7px;fill:none;stroke:#5e50ff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;">'
            '<path d="M2 8H12"/><path d="M8.5 4.5L12 8L8.5 11.5"/>'
            '</svg>'
        )
        icon_tip_header = (
            '<svg width="13" height="13" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" '
            'style="vertical-align:-2px;margin-right:6px;fill:none;stroke:#5f4bff;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;">'
            '<path d="M8 1.5 13 3.5V7.3c0 3.1-2.1 5.8-5 6.8-2.9-1-5-3.7-5-6.8V3.5l5-2Z"/>'
            '</svg>'
        )
        icon_tip_password = (
            '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" '
            'style="display:block;margin:0 auto 5px;fill:none;stroke:#7a6bff;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;">'
            '<rect x="3.5" y="7" width="9" height="7" rx="1.3"/><path d="M5.5 7V5.5a2.5 2.5 0 1 1 5 0V7"/>'
            '</svg>'
        )
        icon_tip_2fa = (
            '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" '
            'style="display:block;margin:0 auto 5px;fill:none;stroke:#7a6bff;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;">'
            '<path d="M8 1.5 13 3.5V7.3c0 3.1-2.1 5.8-5 6.8-2.9-1-5-3.7-5-6.8V3.5l5-2Z"/><path d="m5.8 8 1.4 1.4L10.4 6.2"/>'
            '</svg>'
        )
        icon_tip_devices = (
            '<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" '
            'style="display:block;margin:0 auto 5px;fill:none;stroke:#7a6bff;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;">'
            '<rect x="2" y="2.5" width="8.5" height="6.5" rx="1.2"/><path d="M1.5 11.5h9.5"/><circle cx="11.7" cy="10.5" r="2.2"/><path d="m13.2 12 1.3 1.3"/>'
            '</svg>'
        )
        safe_yes_url = escape(_frontend_url("notifications"))
        safe_no_url = escape(_frontend_url("settings/security"))
        html_body = _render_email_template(
            "new_device_alert.html",
            {
                "safe_subject": safe_subject,
                "safe_name": safe_name,
                "safe_title": safe_title,
                "safe_intro": safe_intro,
                "safe_device_label": safe_device_label,
                "safe_browser": safe_browser,
                "safe_os": safe_os,
                "safe_location": safe_location,
                "safe_detected_at": safe_detected_at,
                "safe_ip": safe_ip,
                "safe_cta_label": safe_cta_label,
                "safe_cta_url": safe_cta_url,
                "safe_footer": safe_footer,
                "safe_support_email": safe_support_email,
                "safe_yes_url": safe_yes_url,
                "safe_no_url": safe_no_url,
                "icon_device": icon_device,
                "icon_browser": icon_browser,
                "icon_os": icon_os,
                "icon_location": icon_location,
                "icon_time": icon_time,
                "icon_ip": icon_ip,
                "icon_lock_cta": icon_lock_cta,
                "icon_arrow_cta": icon_arrow_cta,
                "icon_tip_header": icon_tip_header,
                "icon_tip_password": icon_tip_password,
                "icon_tip_2fa": icon_tip_2fa,
                "icon_tip_devices": icon_tip_devices,
            },
        )

        return subject, text_body, html_body


def _render_shell(
    *,
    subject: str,
    recipient_name: str,
    badge: str,
    title: str,
    intro: str,
    highlights: tuple[tuple[str, str], ...],
    items: tuple[tuple[str, str, str], ...],
    footer: str,
    cta_label: str,
    cta_url: str,
    quote: tuple[str, str] | None,
) -> tuple[str, str, str]:
    text_lines = [
        f"Hi {recipient_name},",
        "",
        intro,
        "",
        "Highlights:",
    ]
    for label, value in highlights:
        text_lines.append(f"- {label}: {value}")

    text_lines.extend(["", "Action plan:"])
    for item_title, detail, meta in items:
        text_lines.append(f"- {item_title}: {detail} ({meta})")

    if quote:
        text_lines.extend(["", f"Quote: \"{quote[0]}\" - {quote[1]}"])

    text_lines.extend(["", f"Open: {cta_url}", "", footer, "", "Team Shadow"])
    text_body = "\n".join(text_lines)

    safe_subject = escape(subject)
    safe_name = escape(recipient_name)
    safe_badge = escape(badge)
    safe_title = escape(title)
    safe_intro = escape(intro)
    safe_footer = escape(footer)
    safe_cta_label = escape(cta_label)
    safe_cta_url = escape(cta_url)

    highlight_rows = "".join(_render_highlight_row(index, row[0], row[1]) for index, row in enumerate(highlights))
    item_rows = "".join(_render_item_row(*row) for row in items)
    quote_block = _render_quote_block(quote) if quote else ""

    html_body = f"""<!doctype html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>{safe_subject}</title>
  </head>
  <body style=\"margin:0;padding:0;background:#edf2f7;font-family:Verdana, Geneva, Tahoma, sans-serif;color:#1a202c;\">
    <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#edf2f7;padding:28px 0;\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"620\" style=\"max-width:620px;background:#ffffff;border:1px solid #d8e1ea;border-radius:16px;overflow:hidden;\">
            <tr>
              <td style=\"background:#0f172a;padding:26px 30px;\">
                <div style=\"font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#93c5fd;font-weight:700;\">{safe_badge}</div>
                <h1 style=\"margin:10px 0 8px;color:#f8fafc;font-size:26px;line-height:1.2;\">{safe_title}</h1>
                <p style=\"margin:0;color:#cbd5e1;font-size:15px;line-height:1.6;\">Hi {safe_name}, {safe_intro}</p>
              </td>
            </tr>

            <tr>
              <td style=\"padding:20px 30px 6px;\">
                <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"border-collapse:separate;border-spacing:0 10px;\">
                  {highlight_rows}
                </table>
              </td>
            </tr>

            <tr>
              <td style=\"padding:8px 30px 0;\">
                <h2 style=\"margin:0 0 10px;font-size:18px;color:#0f172a;\">Action plan</h2>
                <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"border-collapse:separate;border-spacing:0 10px;\">
                  {item_rows}
                </table>
              </td>
            </tr>

            {quote_block}

            <tr>
              <td style=\"padding:18px 30px 8px;\">
                <a href=\"{safe_cta_url}\" style=\"display:inline-block;background:#0f172a;color:#f8fafc;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:700;font-size:14px;\">{safe_cta_label}</a>
              </td>
            </tr>

            <tr>
              <td style=\"padding:14px 30px 28px;\">
                <table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;\">
                  <tr>
                    <td style=\"padding:14px 16px;font-size:13px;line-height:1.6;color:#334155;\">{safe_footer}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""

    return subject, text_body, html_body


def _render_highlight_row(index: int, label: str, value: str) -> str:
    palettes = (
        ("#f8fafc", "#e2e8f0", "#475569", "#0f172a"),
        ("#fff7ed", "#fed7aa", "#9a3412", "#7c2d12"),
        ("#eff6ff", "#bfdbfe", "#1d4ed8", "#1e3a8a"),
    )
    bg, border, label_color, value_color = palettes[index % len(palettes)]
    safe_label = escape(label)
    safe_value = escape(value)
    return (
        "<tr>"
        f"<td style=\"background:{bg};border:1px solid {border};border-radius:12px;padding:14px 16px;\">"
        f"<div style=\"font-size:12px;color:{label_color};font-weight:700;text-transform:uppercase;letter-spacing:0.8px;\">{safe_label}</div>"
        f"<div style=\"font-size:16px;color:{value_color};font-weight:700;margin-top:6px;\">{safe_value}</div>"
        "</td>"
        "</tr>"
    )


def _render_item_row(title: str, detail: str, meta: str) -> str:
    safe_title = escape(title)
    safe_detail = escape(detail)
    safe_meta = escape(meta)
    return (
        "<tr>"
        "<td style=\"background:#ffffff;border:1px solid #dbe6f2;border-radius:12px;padding:14px 16px;\">"
        f"<div style=\"font-size:15px;color:#0f172a;font-weight:700;line-height:1.35;\">{safe_title}</div>"
        f"<div style=\"margin-top:6px;font-size:13px;color:#334155;\">{safe_detail}</div>"
        f"<div style=\"margin-top:10px;font-size:12px;color:#475569;font-weight:700;letter-spacing:0.3px;\">{safe_meta}</div>"
        "</td>"
        "</tr>"
    )


def _render_quote_block(quote: tuple[str, str]) -> str:
    quote_text = escape(quote[0])
    quote_author = escape(quote[1])
    return (
        "<tr>"
        "<td style=\"padding:18px 30px 10px;\">"
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" "
        "style=\"background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;\">"
        "<tr><td style=\"padding:14px 16px;\">"
        "<div style=\"font-size:12px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;\">Daily Motivation</div>"
        f"<p style=\"margin:8px 0 4px;font-size:17px;line-height:1.45;color:#14532d;font-weight:700;\">\"{quote_text}\"</p>"
        f"<p style=\"margin:0;font-size:13px;color:#166534;\">- {quote_author}</p>"
        "</td></tr></table>"
        "</td>"
        "</tr>"
    )
