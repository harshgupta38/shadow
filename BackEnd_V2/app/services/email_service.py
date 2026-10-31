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
_SMTP_TIMEOUT_SECONDS = 15  # per socket operation, not per attempt: see _DeadlineSMTP
_SEND_BUDGET_SECONDS = 60  # total for all attempts of one send
# A browser is waiting on a manual "Email report" send, so it gives up sooner: about 20 s in total.
_INTERACTIVE_RETRY_DELAYS = (0, 2)
_INTERACTIVE_SMTP_TIMEOUT_SECONDS = 10
_INTERACTIVE_SEND_BUDGET_SECONDS = 20


class EmailAttachment(TypedDict):
    filename: str
    content: bytes
    mime_type: str


def smtp_configured() -> bool:
    """Email is off unless a server is set (SMTP_HOST); the sender address alone is not enough."""
    return bool(settings.smtp_host and settings.smtp_from_email)


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


class _DeadlineSMTP(smtplib.SMTP):
    """Caps the whole conversation with the server, not just each socket operation.

    smtplib's timeout restarts on every connect, send and read, so a server that answers each command a little
    inside it can hold a send for minutes. Before each operation the socket timeout is cut to the time left until
    `deadline` (a time.monotonic() value), and once it has passed the connection is closed.
    DNS lookup is the one step the socket timeout does not reach.
    """

    def __init__(self, host: str, port: int, *, timeout: float, deadline: float, **kwargs):
        self._deadline = deadline
        self._operation_timeout = timeout
        super().__init__(host, port, timeout=min(timeout, self._remaining()), **kwargs)

    def _remaining(self) -> float:
        remaining = self._deadline - time.monotonic()
        if remaining <= 0:
            self.close()
            raise smtplib.SMTPServerDisconnected("SMTP deadline passed")
        return remaining

    def _limit_next_operation(self) -> None:
        remaining = self._remaining()
        if self.sock is not None:
            try:
                self.sock.settimeout(min(self._operation_timeout, remaining))
            except OSError:
                # A failed TLS upgrade leaves a dead socket here. Report it as smtplib itself would, so the quit in
                # __exit__ ignores it instead of replacing the original error.
                self.close()
                raise smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

    def send(self, s):
        self._limit_next_operation()
        super().send(s)

    def getreply(self):
        self._limit_next_operation()
        return super().getreply()


class _DeadlineSMTP_SSL(_DeadlineSMTP, smtplib.SMTP_SSL):
    """The same limits over an SSL connection from the start (SMTP_SSL)."""


def _attempt_send(message: EmailMessage, timeout: float, deadline: float) -> None:
    """Single delivery attempt — raises on any SMTP error, or once the deadline has passed."""
    if settings.smtp_use_ssl:
        # SMTP_SSL skips certificate checks without a context, so the login would go to any server that answers.
        context = ssl.create_default_context()
        with _DeadlineSMTP_SSL(
            settings.smtp_host, settings.smtp_port, timeout=timeout, deadline=deadline, context=context
        ) as server:
            if settings.smtp_username and settings.smtp_password:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)
        return

    with _DeadlineSMTP(settings.smtp_host, settings.smtp_port, timeout=timeout, deadline=deadline) as server:
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
    interactive: bool = False,
) -> bool:
    """Send an email via SMTP with up to 3 attempts and exponential backoff.

    interactive=True is for a send a user is waiting on: 2 attempts, a 10 s socket timeout and 20 s in total
    (otherwise 60 s in total).
    Returns True on success, False when SMTP is unconfigured or all attempts fail.
    Non-retryable errors (an invalid recipient, a 5xx reply, an untrusted server certificate) are not retried.
    """
    if not smtp_configured():
        logger.debug("SMTP not configured; skipping email to %s", to_email)
        return False

    message = _build_message(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        attachments=attachments,
    )

    delays = _INTERACTIVE_RETRY_DELAYS if interactive else _RETRY_DELAYS
    timeout = _INTERACTIVE_SMTP_TIMEOUT_SECONDS if interactive else _SMTP_TIMEOUT_SECONDS
    deadline = time.monotonic() + (_INTERACTIVE_SEND_BUDGET_SECONDS if interactive else _SEND_BUDGET_SECONDS)
    last_exc: Exception | None = None
    attempts = 0
    for attempt, delay in enumerate(delays, start=1):
        if delay:
            if deadline - time.monotonic() <= delay:
                break  # not enough time left to wait and then try again
            time.sleep(delay)
        attempts = attempt
        try:
            _attempt_send(message, timeout, deadline)
            if attempt > 1:
                logger.info("Email delivered on attempt %d to %s", attempt, to_email)
            return True
        except smtplib.SMTPRecipientsRefused as exc:
            # Permanent rejection from the server — do not retry.
            logger.error("Recipient refused by SMTP server for %s: %s", to_email, exc)
            return False
        except ssl.SSLCertVerificationError as exc:
            # A certificate that is not trusted will not change on retry, and the login must not go to that server.
            logger.error("SMTP server certificate for %s is not trusted: %s", settings.smtp_host, exc)
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

    logger.error("SMTP gave up on %s after %d attempt(s). Last error: %s", to_email, attempts, last_exc)
    return False
