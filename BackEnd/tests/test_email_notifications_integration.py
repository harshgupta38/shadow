"""Integration tests for email notification controls and delivery hooks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import app.scheduler.jobs as scheduler_jobs


def test_change_password_triggers_password_changed_email(
    client,
    auth_headers,
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    import app.services.auth_service as auth_service

    def _fake_send_notification_email(db, user, *, template_key, context=None, force=False):
        captured["user_id"] = user.id
        captured["template_key"] = template_key
        captured["context"] = context or {}
        captured["force"] = force
        return True

    monkeypatch.setattr(
        auth_service.email_notification_service,
        "send_notification_email",
        _fake_send_notification_email,
    )

    response = client.post(
        "/api/profile/change-password",
        headers=auth_headers,
        json={"current_password": "password123", "new_password": "password1234"},
    )
    assert response.status_code == 200
    assert captured["template_key"] == "password_changed_alert"
    assert captured["force"] is False


def test_due_task_reminder_sends_email_when_enabled(
    client,
    auth_headers,
    monkeypatch,
) -> None:
    set_notifications = client.put(
        "/api/settings/notifications",
        headers=auth_headers,
        json={"email_notifications_enabled": True},
    )
    assert set_notifications.status_code == 200

    created = client.post(
        "/api/notifications",
        headers=auth_headers,
        json={
            "title": "Task reminder: Deep work block",
            "body": "Focus sprint starts now.",
            "type": "reminder",
            "scheduled_at": (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(),
        },
    )
    assert created.status_code == 201

    captured: list[dict[str, object]] = []

    def _fake_send_notification_email(db, user, *, template_key, context=None, force=False):
        captured.append(
            {
                "user_id": user.id,
                "template_key": template_key,
                "context": context or {},
                "force": force,
            }
        )
        return True

    monkeypatch.setattr(
        scheduler_jobs.email_notification_service,
        "send_notification_email",
        _fake_send_notification_email,
    )

    dispatched = scheduler_jobs.process_due_notifications()
    assert dispatched >= 1
    assert any(item["template_key"] == "task_reminders" for item in captured)
