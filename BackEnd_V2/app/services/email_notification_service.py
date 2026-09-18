"""Email notifications for Level-1 (Critical) and security-type events.

Only two categories trigger email in V2:
  • level == LEVEL_CRITICAL (1)  — always delivered regardless of user prefs
  • type == "security"           — always delivered (account lockout, etc.)

Everything else is in-app only.
"""

from __future__ import annotations

import hashlib
import hmac
import html
import logging
import re
import time
from datetime import date
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import UserDBM
from app.schemas.daily_report import GoalAlignmentResponse, ReportHighlightsResponse, ReportResponse, ReportStatsResponse
from app.services import email_service

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates" / "email"
_TOKEN_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


@lru_cache(maxsize=16)
def _load_template(name: str) -> str:
    path = _TEMPLATES_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Email template not found: {path}")
    return path.read_text(encoding="utf-8")


def _render(template_name: str, context: dict[str, str]) -> str:
    template = _load_template(template_name)
    return _TOKEN_RE.sub(lambda m: context.get(m.group(1), ""), template)


def _e(value: str | None) -> str:
    return html.escape(str(value or ""), quote=True)


def _frontend_url(path: str = "/") -> str:
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}{path}"


# ─── Unsubscribe token ────────────────────────────────────────────────────────

def make_unsub_token(user_id: int, email: str) -> str:
    """HMAC-SHA256 token tied to the user's id and email address."""
    key = settings.jwt_secret.encode()
    msg = f"unsub:{user_id}:{email}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def verify_unsub_token(user_id: int, email: str, token: str) -> bool:
    expected = make_unsub_token(user_id, email)
    return hmac.compare_digest(expected, token)


def _unsub_url(user: UserDBM) -> str:
    token = make_unsub_token(user.id, user.email)
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}/api/v2/notifications/email/unsubscribe?uid={user.id}&token={token}"


# ─── Email-verification token ─────────────────────────────────────────────────

def make_verification_token(user_id: int, email: str) -> str:
    """HMAC-SHA256 token tied to the user's id and email address."""
    key = settings.jwt_secret.encode()
    msg = f"verify-email:{user_id}:{email}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def verify_verification_token(user_id: int, email: str, token: str) -> bool:
    expected = make_verification_token(user_id, email)
    return hmac.compare_digest(expected, token)


def _verify_email_url(user: UserDBM) -> str:
    # Points at the FRONTEND page (VerifyEmailPage), not the legacy
    # GET /api/v2/auth/verify-email backend route directly. A raw GET link
    # that mutates state on load is also vulnerable to email-client link
    # prescanning (Outlook/Gmail safe-links, corporate scanners) silently
    # consuming the token before the user ever clicks it — routing through
    # a page that calls the API from JS avoids that, same reasoning as
    # _reset_password_url below.
    token = make_verification_token(user.id, user.email)
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}/verify-email?uid={user.id}&token={token}"


# ─── Password-reset token ──────────────────────────────────────────────────────
# Unlike the unsub/verify-email tokens above (which never expire and are safe
# to reuse indefinitely), a password-reset link grants control of the account
# and must expire and become single-use:
#   • expiry is embedded in the token itself (`{expires_at}.{signature}`), no
#     DB row needed to track it.
#   • "single-use" comes for free by signing over the user's CURRENT
#     hashed_password — the moment the password actually changes (via this
#     flow or any other), every previously-issued token's signature stops
#     matching and verification fails.

_RESET_PASSWORD_TTL_SECONDS = 600  # 10 minutes


def make_reset_password_token(user_id: int, email: str, hashed_password: str, expires_at: int) -> str:
    key = settings.jwt_secret.encode()
    msg = f"reset-password:{user_id}:{email}:{hashed_password}:{expires_at}".encode()
    signature = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return f"{expires_at}.{signature}"


def issue_reset_password_token(user: UserDBM) -> str:
    expires_at = int(time.time()) + _RESET_PASSWORD_TTL_SECONDS
    return make_reset_password_token(user.id, user.email, user.hashed_password, expires_at)


def verify_reset_password_token(user: UserDBM, token: str) -> bool:
    expires_str, _, signature = token.partition(".")
    if not signature:
        return False
    try:
        expires_at = int(expires_str)
    except ValueError:
        return False
    if time.time() > expires_at:
        return False
    expected = make_reset_password_token(user.id, user.email, user.hashed_password, expires_at)
    return hmac.compare_digest(expected, token)


def _reset_password_url(user: UserDBM, token: str) -> str:
    # Points at the FRONTEND (not /api/v2/... like the unsub/verify-email
    # links above) — this one needs an interactive form, not a static
    # backend-rendered confirmation page.
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}/reset-password?uid={user.id}&token={token}"


# ─── Preference gate ──────────────────────────────────────────────────────────

def _email_enabled(db: Session, user_id: int) -> bool:
    """Returns False if the user has opted out of email notifications."""
    try:
        from sqlalchemy import select
        from app.models.user_setting import UserSettingDBM
        row = db.scalar(select(UserSettingDBM).where(UserSettingDBM.user_id == user_id))
        if row and row.notifications:
            return bool(dict(row.notifications).get("email_notifications_enabled", True))
    except Exception:
        pass
    return True  # Default: allow when preference cannot be read


def _report_email_enabled(db: Session, user_id: int, report_type: str) -> bool:
    """Returns False if the user has opted this specific report cadence
    (daily/weekly) out of the auto-send email — see UserSettingDBM.reports."""
    try:
        from sqlalchemy import select
        from app.models.user_setting import UserSettingDBM
        row = db.scalar(select(UserSettingDBM).where(UserSettingDBM.user_id == user_id))
        if row and row.reports:
            section = dict(row.reports).get(report_type) or {}
            return bool(section.get("email_enabled", True))
    except Exception:
        pass
    return True  # Default: allow when preference cannot be read


# ─── Public API ───────────────────────────────────────────────────────────────

def send_notification_email(
    db: Session,
    user: UserDBM,
    *,
    title: str,
    body: str | None,
    notif_type: str,
    url: str | None,
    notification_id: int | None = None,
) -> bool:
    """Send an email for a critical or security notification.

    Security-type alerts (failed login, account locked, etc.) always send
    regardless of the user's general email preference — an account-security
    event isn't something a user should be able to accidentally silence.
    Other critical notifications still respect the preference.
    """
    if notif_type != "security" and not _email_enabled(db, user.id):
        return False

    # Guard: skip if this notification was already emailed (duplicate-send prevention).
    if notification_id is not None:
        from app.models.notification import NotificationDBM
        notif_row = db.get(NotificationDBM, notification_id)
        if notif_row and notif_row.emailed:
            logger.debug("Notification %d already emailed — skipping", notification_id)
            return False

    if notif_type == "security":
        sent = _send_security_alert(user, title=title, body=body, url=url)
    else:
        sent = _send_notification_alert(user, title=title, body=body, url=url)

    # Mark as emailed so a retry / restart never re-sends.
    if sent and notification_id is not None:
        try:
            from app.models.notification import NotificationDBM
            notif_row = db.get(NotificationDBM, notification_id)
            if notif_row:
                notif_row.emailed = True
                db.commit()
        except Exception:
            logger.warning("Failed to mark notification %d as emailed", notification_id)

    return sent


def send_welcome_email(user: UserDBM) -> bool:
    """Transactional email sent once on account creation — no unsubscribe required."""
    first_name = user.name.split()[0] if user.name else "there"
    cta_url = _frontend_url("/goals")
    context = {
        "safe_subject": _e("Welcome to Shadow!"),
        "safe_first_name": _e(first_name),
        "safe_cta_url": _e(cta_url),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("welcome.html", context)
    text_body = (
        f"Welcome to Shadow, {first_name}!\n\n"
        "Your intelligent productivity assistant is set up and ready.\n\n"
        f"Get started: {cta_url}"
    )
    return email_service.send_email(
        to_email=user.email,
        subject="Welcome to Shadow!",
        text_body=text_body,
        html_body=html_body,
    )


def send_verification_email(user: UserDBM) -> bool:
    """Transactional email with a one-click verify link — sent on registration
    and again from /auth/resend-verification. Not gated behind the user's
    notification preferences, same reasoning as the welcome email."""
    first_name = user.name.split()[0] if user.name else "there"
    verify_url = _verify_email_url(user)
    context = {
        "safe_subject": _e("Verify your email address"),
        "safe_first_name": _e(first_name),
        "safe_verify_url": _e(verify_url),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("verify_email.html", context)
    text_body = (
        f"Hi {first_name},\n\n"
        "Please verify your email address to secure your Shadow account.\n\n"
        f"Verify now: {verify_url}"
    )
    return email_service.send_email(
        to_email=user.email,
        subject="Verify your email address",
        text_body=text_body,
        html_body=html_body,
    )


def send_reset_password_email(user: UserDBM, token: str) -> bool:
    """Transactional email with a one-click reset link — sent from
    /auth/forgot-password. Not gated behind the user's notification
    preferences: a security-critical, self-requested transactional email,
    same reasoning as the welcome/verification emails."""
    first_name = user.name.split()[0] if user.name else "there"
    reset_url = _reset_password_url(user, token)
    minutes = _RESET_PASSWORD_TTL_SECONDS // 60
    context = {
        "safe_subject": _e("Reset your password"),
        "safe_first_name": _e(first_name),
        "safe_reset_url": _e(reset_url),
        "safe_minutes": _e(str(minutes)),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("reset_password.html", context)
    text_body = (
        f"Hi {first_name},\n\n"
        "We received a request to reset your Shadow account password.\n"
        "If you didn't request this, you can safely ignore this email.\n\n"
        f"Reset your password: {reset_url}\n\n"
        f"This link expires in {minutes} minutes."
    )
    return email_service.send_email(
        to_email=user.email,
        subject="Reset your password",
        text_body=text_body,
        html_body=html_body,
    )


def send_email_enabled_confirmation(user: UserDBM) -> bool:
    """Transactional confirmation sent when the user enables email notifications."""
    first_name = user.name.split()[0] if user.name else "there"
    context = {
        "safe_subject": _e("Email notifications enabled"),
        "safe_first_name": _e(first_name),
        "safe_settings_url": _e(_frontend_url("/settings")),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("email_enabled.html", context)
    text_body = (
        f"Hi {first_name},\n\n"
        "Email notifications are now active for your Shadow account.\n"
        "You'll receive emails for critical alerts and security events.\n\n"
        f"Manage settings: {_frontend_url('/settings')}"
    )
    return email_service.send_email(
        to_email=user.email,
        subject="Email notifications enabled",
        text_body=text_body,
        html_body=html_body,
    )


def send_failed_login_alert(
    db: Session,
    user: UserDBM,
    *,
    device: str,
    ip_address: str,
    location: str | None,
    map_url: str | None,
    when: str,
    notification_id: int | None = None,
) -> bool:
    """Structured security alert for a wrong-password login attempt — labeled
    device/location/IP/time rows, plus a static map image when coordinates are
    available. Always sends regardless of the user's email preference (see
    send_notification_email's notif_type == "security" bypass) — deliberately
    NOT routed through create_notification's generic email dispatch, since that
    only supports a single title+body pair, not this structured layout.
    """
    subject = "Failed sign-in attempt"
    cta_url = _frontend_url("/settings")
    unsub = _unsub_url(user)

    location_row = ""
    if location:
        location_row = (
            '<tr>'
            '<td style="padding:10px 14px;font-size:12px;color:#6b7280;font-weight:600;background:#fafafa;border-bottom:1px solid #e5e7eb;">Location</td>'
            f'<td style="padding:10px 14px;font-size:12px;color:#111827;border-bottom:1px solid #e5e7eb;">{_e(location)}</td>'
            '</tr>'
        )

    map_block = ""
    if map_url:
        map_block = (
            '<tr><td align="center" style="padding:16px 40px 0;">'
            f'<img src="{_e(map_url)}" width="320" height="320" alt="Approximate sign-in area" '
            'style="width:320px;height:320px;border-radius:8px;border:1px solid #e5e7eb;display:inline-block;" />'
            '<div style="margin-top:4px;font-size:10px;color:#9ca3af;">Map data © OpenStreetMap contributors</div>'
            '</td></tr>'
        )

    context = {
        "safe_subject": _e(subject),
        "safe_title": _e(subject),
        "safe_name": _e(user.name.split()[0] if user.name else "there"),
        "safe_device": _e(device),
        "safe_ip": _e(ip_address),
        "safe_time": _e(when),
        "location_row": location_row,
        "map_block": map_block,
        "safe_cta_url": _e(cta_url),
        "safe_unsub_url": _e(unsub),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("failed_login_alert.html", context)

    text_lines = [subject, "", f"Device: {device}"]
    if location:
        text_lines.append(f"Location: {location}")
    text_lines += [f"IP address: {ip_address}", f"Time: {when}", "", f"Review your account: {cta_url}", "", f"Unsubscribe: {unsub}"]
    text_body = "\n".join(text_lines)

    sent = email_service.send_email(
        to_email=user.email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )

    if sent and notification_id is not None:
        try:
            from app.models.notification import NotificationDBM
            notif_row = db.get(NotificationDBM, notification_id)
            if notif_row:
                notif_row.emailed = True
                db.commit()
        except Exception:
            logger.warning("Failed to mark notification %d as emailed", notification_id)

    return sent


def send_daily_brief_email(user: UserDBM, complete_brief: str, today: date) -> bool:
    """Daily-brief email sent when the user's plan is generated for the first time today."""
    first_name = user.name.split()[0] if user.name else "there"
    day_str = today.strftime("%A, %d %B %Y")

    paragraphs = [p.strip() for p in complete_brief.split("\n\n") if p.strip()]
    html_paragraphs = "".join(
        f"<p style='margin:0 0 14px;font-size:14px;line-height:1.75;color:#374151;'>{_e(p)}</p>"
        for p in paragraphs
    )

    context = {
        "safe_subject": _e(f"Good morning, {first_name}! Here's your {today.strftime('%A')}"),
        "safe_day": _e(day_str),
        "safe_brief_text": html_paragraphs,
        "safe_cta_url": _e(_frontend_url(f"/daily-brief?date={today}")),
        "safe_unsub_url": _e(_unsub_url(user)),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("daily_brief.html", context)
    text_body = (
        f"Good morning, {first_name}!\n\n"
        f"{complete_brief}\n\n"
        f"View your brief: {_frontend_url(f'/daily-brief?date={today}')}\n\n"
        f"Unsubscribe: {_unsub_url(user)}"
    )
    return email_service.send_email(
        to_email=user.email,
        subject=f"Good morning, {first_name}! Here's your {today.strftime('%A')} — {day_str}",
        text_body=text_body,
        html_body=html_body,
    )


# ─── Internal senders ─────────────────────────────────────────────────────────

def _send_security_alert(user: UserDBM, *, title: str, body: str | None, url: str | None) -> bool:
    subject = f"Security Alert — {title}"
    cta_url = _frontend_url(url or "/settings")
    unsub = _unsub_url(user)
    context = {
        "safe_subject": _e(subject),
        "safe_title": _e(title),
        "safe_name": _e(user.name.split()[0] if user.name else "there"),
        "safe_body": _e(body or ""),
        "safe_cta_url": _e(cta_url),
        "safe_cta_label": _e("Review your account"),
        "safe_unsub_url": _e(unsub),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("security_alert.html", context)
    text_body = f"{title}\n\n{body or ''}\n\nReview: {cta_url}\n\nUnsubscribe: {unsub}"
    return email_service.send_email(to_email=user.email, subject=subject, text_body=text_body, html_body=html_body)


def _send_notification_alert(user: UserDBM, *, title: str, body: str | None, url: str | None) -> bool:
    cta_url = _frontend_url(url or "/")
    unsub = _unsub_url(user)
    context = {
        "safe_subject": _e(title),
        "safe_title": _e(title),
        "safe_name": _e(user.name.split()[0] if user.name else "there"),
        "safe_body": _e(body or ""),
        "safe_cta_url": _e(cta_url),
        "safe_cta_label": _e("Open Shadow"),
        "safe_unsub_url": _e(unsub),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("notification_alert.html", context)
    text_body = f"{title}\n\n{body or ''}\n\n{cta_url}\n\nUnsubscribe: {unsub}"
    return email_service.send_email(to_email=user.email, subject=title, text_body=text_body, html_body=html_body)


# ─── Report-ready email ─────────────────────────────────────────────────────────
# A full snapshot of the report, shaped to match ReportDetailPage.tsx as closely
# as an HTML email allows: hero score + headline/summary, the 4-stat row, a card
# per goal, the good/attention highlight lists, and the closing message. Colors
# are the frontend's light-theme hex values, hardcoded — email clients don't
# support CSS custom properties or color-mix(). SVG rings are skipped in favor of
# a plain colored circle with the percentage as text (Outlook-safe); progress
# bars use nested <div>s with inline widths (safe everywhere that matters here).

_CLOSING_EMOJI = {"celebrate": "\U0001F389", "motivate": "\U0001F4AA", "guide": "\U0001F9ED"}


def _alignment_colors(pct: int) -> tuple[str, str]:
    """(solid, soft-background) hex pair — mirrors ringColor() in
    ReportDetailPage.constants.ts."""
    if pct >= 75:
        return "#16a97a", "rgba(22,169,122,0.12)"   # --jv-success / --jv-success-soft
    if pct >= 50:
        return "#7c6cff", "rgba(124,108,255,0.12)"  # --jv-brand-1 / --jv-brand-soft
    return "#e0913a", "rgba(224,145,58,0.14)"        # --jv-warn / --jv-warn-soft


_STAT_TONES = {
    "success": ("#16a97a", "rgba(22,169,122,0.12)"),
    "info": ("#4f8bff", "rgba(79,139,255,0.12)"),
    "brand": ("#7c6cff", "rgba(124,108,255,0.12)"),
    "warn": ("#e0913a", "rgba(224,145,58,0.14)"),
}


def _stat_cell(value: str, name: str, hint: str, tone: str) -> str:
    color, soft = _STAT_TONES[tone]
    return (
        '<td width="50%" style="padding:6px;">'
        f'<div style="background:{soft};border:1px solid {color};border-radius:10px;padding:12px 14px;">'
        f'<div style="font-size:21px;font-weight:800;color:{color};line-height:1;">{_e(value)}</div>'
        f'<div style="margin-top:4px;font-size:12px;font-weight:700;color:#111827;">{_e(name)}</div>'
        f'<div style="font-size:10.5px;color:#9ca3af;">{_e(hint)}</div>'
        "</div></td>"
    )


def _build_stats_block(stats: ReportStatsResponse, goals: list[GoalAlignmentResponse], report_type: str) -> str:
    goals_on_track = sum(1 for g in goals if g.alignment_pct >= 75)
    tasks_hint = "daily targets" if report_type == "daily" else "weekly targets"
    habits_hint = "tracked today" if report_type == "daily" else "tracked this week"
    row1 = "<tr>" + _stat_cell(f"{stats.tasks_done}/{stats.tasks_total}", "Tasks Done", tasks_hint, "success") \
        + _stat_cell(f"{stats.habits_done}/{stats.habits_total}", "Habits Done", habits_hint, "info") + "</tr>"
    row2 = "<tr>" + _stat_cell(f"{goals_on_track}/{len(goals)}", "Goals on Track", "aligned ≥ 75%", "brand") \
        + _stat_cell(f"\U0001F525 {stats.best_streak}", "Best Streak", "consecutive days", "warn") + "</tr>"
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{row1}{row2}</table>'


def _goal_card(goal: GoalAlignmentResponse) -> str:
    color, soft = _alignment_colors(goal.alignment_pct)
    bar_pct = round(goal.tasks_done / goal.tasks_total * 100) if goal.tasks_total else 0
    note_row = (
        f'<div style="margin-top:6px;font-size:11.5px;color:#6b7280;line-height:1.5;">{_e(goal.note)}</div>'
        if goal.note else ""
    )
    return (
        '<tr><td style="padding:0 0 10px;">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid {soft};border-radius:10px;">'
        "<tr>"
        '<td width="56" style="padding:12px 0 12px 12px;" valign="top">'
        f'<div style="width:44px;height:44px;border-radius:50%;background:{soft};color:{color};'
        f'font-size:12px;font-weight:800;text-align:center;line-height:44px;font-family:Verdana,Geneva,sans-serif;">{goal.alignment_pct}%</div>'
        "</td>"
        '<td style="padding:12px 14px 12px 4px;" valign="top">'
        f'<div style="font-size:13.5px;font-weight:700;color:#111827;">{_e(goal.title)}</div>'
        f'<div style="display:inline-block;margin-top:3px;padding:2px 8px;border-radius:999px;background:#f3f4f6;color:#6b7280;font-size:10.5px;">{_e(goal.milestone_title)}</div>'
        f"{note_row}"
        f'<div style="margin-top:8px;font-size:10.5px;color:#9ca3af;">{goal.tasks_done} / {goal.tasks_total} tasks</div>'
        f'<div style="margin-top:3px;background:#f3f4f6;border-radius:3px;height:6px;line-height:6px;font-size:0;">'
        f'<div style="background:{color};width:{bar_pct}%;height:6px;border-radius:3px;">&nbsp;</div></div>'
        "</td></tr></table>"
        "</td></tr>"
    )


def _build_goals_block(goals: list[GoalAlignmentResponse]) -> str:
    if not goals:
        return ""
    rows = "".join(_goal_card(g) for g in goals)
    return (
        '<tr><td style="padding:26px 36px 4px;">'
        f'<div style="font-size:11px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">Goal Alignment &middot; {len(goals)} goal{"s" if len(goals) != 1 else ""}</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>'
        "</td></tr>"
    )


def _highlight_row(text: str, color: str, soft: str) -> str:
    return (
        f'<div style="background:{soft};border-left:3px solid {color};border-radius:0 8px 8px 0;'
        f'padding:7px 12px;margin-bottom:6px;font-size:12px;color:#374151;line-height:1.5;">{_e(text)}</div>'
    )


def _build_highlights_block(highlights: ReportHighlightsResponse, report_type: str) -> str:
    if not highlights.good and not highlights.attention:
        return ""
    label = "Today's Highlights" if report_type == "daily" else "This Week's Highlights"
    sections = ""
    if highlights.good:
        sections += (
            '<div style="margin-bottom:12px;">'
            '<div style="font-size:11px;font-weight:700;color:#16a97a;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">&#10003; Went well</div>'
            + "".join(_highlight_row(t, "#16a97a", "rgba(22,169,122,0.12)") for t in highlights.good)
            + "</div>"
        )
    if highlights.attention:
        sections += (
            '<div>'
            '<div style="font-size:11px;font-weight:700;color:#e0913a;text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">&#9888; Needs attention</div>'
            + "".join(_highlight_row(t, "#e0913a", "rgba(224,145,58,0.14)") for t in highlights.attention)
            + "</div>"
        )
    return (
        '<tr><td style="padding:22px 36px 4px;">'
        f'<div style="font-size:11px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;">{_e(label)}</div>'
        f"{sections}"
        "</td></tr>"
    )


def send_report_email(db: Session, user: UserDBM, report: ReportResponse, *, force: bool = False) -> bool:
    """Full report snapshot, shaped to match ReportDetailPage.tsx. Sent
    automatically when a report finishes generating — gated by BOTH the
    general email-notifications preference (like any other type!="security"
    email) AND the report-cadence-specific opt-out (UserSettingDBM.reports.
    {daily,weekly}.email_enabled), since a user may want emails in general
    but not for this particular cadence. Sent again on-demand from the
    "Email report" button on that page (`force=True` — an explicit user
    action shouldn't be silently swallowed by either passive preference)."""
    if not force and not (_email_enabled(db, user.id) and _report_email_enabled(db, user.id, report.report_type)):
        return False

    first_name = user.name.split()[0] if user.name else "there"
    label = report.report_type.capitalize()
    date_str = report.date.strftime("%d %b %Y")
    score_color, score_soft = _alignment_colors(report.alignment_score)
    cta_url = _frontend_url(f"/reports/{report.date.isoformat()}?report_type={report.report_type}")
    unsub = _unsub_url(user)

    context = {
        "safe_subject": _e(f"Your {label} report for {report.date.strftime('%d %b')} is ready"),
        "safe_first_name": _e(first_name),
        "safe_label": _e(label),
        "safe_date": _e(date_str),
        "score_color": score_color,
        "score_soft": score_soft,
        "safe_score": _e(str(report.alignment_score)),
        "safe_headline": _e(report.headline),
        "safe_summary": _e(report.summary),
        "stats_block": _build_stats_block(report.stats, report.goals, report.report_type),
        "goals_block": _build_goals_block(report.goals),
        "highlights_block": _build_highlights_block(report.highlights, report.report_type),
        "safe_closing_emoji": _CLOSING_EMOJI.get(report.closing.tone, "\U0001F9ED"),
        "safe_closing_message": _e(report.closing.message),
        "safe_cta_url": _e(cta_url),
        "safe_unsub_url": _e(unsub),
        "safe_support_email": _e("support@shadow.app"),
        "safe_footer": _e("© Shadow — Your AI-powered life and career assistant"),
    }
    html_body = _render("report_ready.html", context)

    text_lines = [
        f"Your {label} report for {date_str}",
        f"Alignment: {report.alignment_score}%",
        "",
        report.headline,
        report.summary,
        "",
        f"Tasks: {report.stats.tasks_done}/{report.stats.tasks_total}   Habits: {report.stats.habits_done}/{report.stats.habits_total}   Best streak: {report.stats.best_streak}",
    ]
    if report.highlights.good:
        text_lines += ["", "Went well:"] + [f"  - {t}" for t in report.highlights.good]
    if report.highlights.attention:
        text_lines += ["", "Needs attention:"] + [f"  - {t}" for t in report.highlights.attention]
    text_lines += ["", report.closing.message, "", f"View full report: {cta_url}", "", f"Unsubscribe: {unsub}"]
    text_body = "\n".join(text_lines)

    return email_service.send_email(
        to_email=user.email,
        subject=f"Your {label} report for {report.date.strftime('%d %b')} is ready",
        text_body=text_body,
        html_body=html_body,
    )
