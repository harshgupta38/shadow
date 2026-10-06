"""SMTP email transport — no third-party library required."""

from __future__ import annotations

import logging
import smtplib
import ssl
import time
from email.message import EmailMessage
from typing import TypedDict

from app.core.config import settings

logger = logging.getLogger(__name__)

_RETRY_DELAYS = (0, 2, 4)  # seconds before each attempt (first is immediate)


class EmailAttachment(TypedDict):
    filename: str
    content: bytes
    mime_type: str


def _sender_display() -> str:
    if settings.smtp_from_name and settings.smtp_from_email:
        return f"{settings.smtp_from_name} <{settings.smtp_from_email}>"
    return settings.smtp_from_email


def _build_message(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None,
    attachments: list[EmailAttachment] | None,
) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = _sender_display()
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
    for attachment in attachments or []:
        mime_type = attachment.get("mime_type", "application/octet-stream")
        maintype, subtype = (mime_type.split("/", 1) if "/" in mime_type else ("application", "octet-stream"))
        message.add_attachment(
            attachment["content"],
            maintype=maintype,
            subtype=subtype,
            filename=attachment["filename"],
        )
    return message


def _attempt_send(message: EmailMessage) -> None:
    """Single delivery attempt — raises on any SMTP error."""
    if settings.smtp_use_ssl:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
        if settings.smtp_use_tls:
            server.starttls(context=ssl.create_default_context())
        if settings.smtp_username and settings.smtp_password:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)


def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    attachments: list[EmailAttachment] | None = None,
) -> bool:
    """Send an email via SMTP with up to 3 attempts and exponential backoff.

    Returns True on success, False when SMTP is unconfigured or all attempts fail.
    Non-retryable errors (e.g. invalid recipient 5xx) are not retried.
    """
    if not settings.smtp_host or not settings.smtp_from_email:
        logger.debug("SMTP not configured; skipping email to %s", to_email)
        return False

    message = _build_message(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        attachments=attachments,
    )

    last_exc: Exception | None = None
    for attempt, delay in enumerate(_RETRY_DELAYS, start=1):
        if delay:
            time.sleep(delay)
        try:
            _attempt_send(message)
            if attempt > 1:
                logger.info("Email delivered on attempt %d to %s", attempt, to_email)
            return True
        except smtplib.SMTPRecipientsRefused as exc:
            # Permanent rejection from the server — do not retry.
            logger.error("Recipient refused by SMTP server for %s: %s", to_email, exc)
            return False
        except smtplib.SMTPResponseException as exc:
            if exc.smtp_code >= 500:
                # 5xx = permanent error — do not retry.
                logger.error("Permanent SMTP error %d for %s: %s", exc.smtp_code, to_email, exc.smtp_error)
                return False
            last_exc = exc
            logger.warning("Transient SMTP error on attempt %d for %s: %s", attempt, to_email, exc)
        except Exception as exc:
            last_exc = exc
            logger.warning("SMTP attempt %d failed for %s: %s", attempt, to_email, exc)

    logger.error("All %d SMTP attempts failed for %s. Last error: %s", len(_RETRY_DELAYS), to_email, last_exc)
    return False
