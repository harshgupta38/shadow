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
from datetime import date
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import UserDBM
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
