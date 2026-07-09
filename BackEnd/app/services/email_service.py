"""Simple SMTP email sender used by account verification flows."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import TypedDict

from app.constant import settings

logger = logging.getLogger(__name__)


class EmailAttachment(TypedDict):
    filename: str
    content: bytes
    mime_type: str


def _sender_display() -> str:
    if settings.smtp_from_name and settings.smtp_from_email:
        return f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    return settings.smtp_from_email


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    attachments: list[EmailAttachment] | None = None,
) -> bool:
    """Send email over SMTP. Returns False when SMTP is unavailable or fails."""
    if not settings.smtp_host or not settings.smtp_from_email:
        logger.info("SMTP not configured; skipping email dispatch to %s", to_email)
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _sender_display()
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
    for attachment in attachments or []:
        mime_type = attachment.get("mime_type", "application/octet-stream")
        if "/" in mime_type:
            maintype, subtype = mime_type.split("/", 1)
        else:
            maintype, subtype = "application", "octet-stream"
        message.add_attachment(
            attachment["content"],
            maintype=maintype,
            subtype=subtype,
            filename=attachment["filename"],
        )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(
                settings.smtp_host,
                settings.smtp_port,
                timeout=15,
            ) as server:
                if settings.smtp_username and settings.smtp_password:
                    server.login(settings.smtp_username, settings.smtp_password)
                server.send_message(message)
            return True

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls(context=ssl.create_default_context())
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False
