"""Journal, notifications, and profile API tests."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.models.enums import NotificationType
from app.models.notification import Notification
from app.models.push_subscription import PushSubscription


def test_journal_crud(client: TestClient, auth_headers: dict) -> None:
    created = client.post(
        "/api/journal",
        headers=auth_headers,
        json={"content": "Today was productive", "mood": "Good"},
    )
    assert created.status_code == 201
    created_json = created.json()
    assert created_json["shadow_response"].startswith("[fake-llm]")
    assert created_json["goal_alignment"]
    entry_id = created_json["id"]

    assert len(client.get("/api/journal", headers=auth_headers).json()) == 1

    updated = client.put(
        f"/api/journal/{entry_id}", headers=auth_headers, json={"content": "edited"}
    )
    updated_json = updated.json()
    assert updated_json["content"] == "edited"
    assert updated_json["shadow_response"].startswith("[fake-llm]")
    assert updated_json["goal_alignment"]

    assert client.delete(f"/api/journal/{entry_id}", headers=auth_headers).status_code == 204


def test_journal_rejects_invalid_mood(client: TestClient, auth_headers: dict) -> None:
    response = client.post(
        "/api/journal",
        headers=auth_headers,
        json={"content": "Mood test", "mood": "amazing"},
    )
    assert response.status_code == 422


def test_journal_extracts_goal_alignment_and_memory(client: TestClient, auth_headers: dict) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={
            "title": "Crack Google interviews",
            "description": "Solve LeetCode consistently and improve DSA speed.",
        },
    )
    assert goal.status_code == 201

    created = client.post(
        "/api/journal",
        headers=auth_headers,
        json={
            "content": "I solved 5 LeetCode problems this morning and want to keep this daily routine for interviews.",
            "mood": "Great",
        },
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["goal_alignment"]

    memories = client.get("/api/profile/memories", headers=auth_headers).json()
    behavior_memories = [m for m in memories if m["source"] == "behavior"]
    assert behavior_memories
    assert any("leetcode" in m["ai_understanding"].lower() for m in behavior_memories)


def test_journal_small_edit_skips_ai_refresh(
    client: TestClient,
    auth_headers: dict,
    monkeypatch,
) -> None:
    created = client.post(
        "/api/journal",
        headers=auth_headers,
        json={
            "content": "I solved 10 LeetCode problems and will stay consistent tomorrow.",
            "mood": "Great",
        },
    )
    assert created.status_code == 201
    created_json = created.json()

    import app.services.journal_service as journal_service

    calls = {"reflection": 0, "alignment": 0, "memory": 0}

    def spy_reflection(*args, **kwargs):
        calls["reflection"] += 1
        return "[spy-reflection]"

    def spy_alignment(*args, **kwargs):
        calls["alignment"] += 1
        return "[spy-alignment]"

    def spy_memory(*args, **kwargs):
        calls["memory"] += 1
        return '{"insights": []}'

    monkeypatch.setattr(journal_service, "generate_journal_reflection", spy_reflection)
    monkeypatch.setattr(journal_service, "generate_journal_goal_alignment", spy_alignment)
    monkeypatch.setattr(journal_service, "extract_journal_memory_insights", spy_memory)

    updated = client.put(
        f"/api/journal/{created_json['id']}",
        headers=auth_headers,
        json={"content": "I solved 10 LeetCode problems and will stay consistent tomorrow!!"},
    )
    assert updated.status_code == 200
    updated_json = updated.json()

    assert updated_json["content"].endswith("!!")
    assert updated_json["shadow_response"] == created_json["shadow_response"]
    assert updated_json["goal_alignment"] == created_json["goal_alignment"]
    assert calls == {"reflection": 0, "alignment": 0, "memory": 0}


def test_notifications_flow(client: TestClient, auth_headers: dict) -> None:
    created = client.post(
        "/api/notifications",
        headers=auth_headers,
        json={"title": "Plan your day", "body": "5 minute review"},
    )
    assert created.status_code == 201
    notification_id = created.json()["id"]

    unread = client.get("/api/notifications?unread_only=true", headers=auth_headers).json()
    assert any(n["id"] == notification_id for n in unread)

    read = client.patch(
        f"/api/notifications/{notification_id}/read", headers=auth_headers
    ).json()
    assert read["read"] is True


def test_push_public_key_defaults_to_not_configured(
    client: TestClient,
    auth_headers: dict,
    monkeypatch,
) -> None:
    from app.constant import settings

    monkeypatch.setattr(settings, "web_push_vapid_public_key", "")
    monkeypatch.setattr(settings, "web_push_vapid_private_key", "")
    monkeypatch.setattr(settings, "web_push_vapid_subject", "")

    response = client.get("/api/notifications/push/public-key", headers=auth_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["configured"] is False
    assert payload["public_key"] is None


def test_push_subscription_register_and_delete(
    client: TestClient,
    auth_headers: dict,
) -> None:
    endpoint = "https://example.push/endpoint-1"
    register = client.post(
        "/api/notifications/push/subscriptions",
        headers=auth_headers,
        json={
            "endpoint": endpoint,
            "keys": {
                "p256dh": "p256dh-key",
                "auth": "auth-key",
            },
        },
    )
    assert register.status_code == 204

    with SessionLocal() as db:
        subscriptions = list(db.scalars(select(PushSubscription)))
    assert len(subscriptions) == 1
    assert subscriptions[0].endpoint == endpoint

    delete = client.request(
        "DELETE",
        "/api/notifications/push/subscriptions",
        headers=auth_headers,
        json={"endpoint": endpoint},
    )
    assert delete.status_code == 204

    with SessionLocal() as db:
        remaining = list(db.scalars(select(PushSubscription)))
    assert remaining == []


def test_notifications_respect_settings_switches(client: TestClient, auth_headers: dict) -> None:
    off = client.put(
        "/api/settings/notifications",
        headers=auth_headers,
        json={"notifications_enabled": False},
    )
    assert off.status_code == 200

    blocked = client.post(
        "/api/notifications",
        headers=auth_headers,
        json={"title": "Plan", "body": "check", "type": "reminder"},
    )
    assert blocked.status_code == 409

    on = client.put(
        "/api/settings/notifications",
        headers=auth_headers,
        json={
            "notifications_enabled": True,
            "reminder_notifications_enabled": False,
            "daily_brief_enabled": False,
            "weekly_summary_enabled": False,
        },
    )
    assert on.status_code == 200

    blocked_reminder = client.post(
        "/api/notifications",
        headers=auth_headers,
        json={"title": "Task reminder", "type": "reminder"},
    )
    assert blocked_reminder.status_code == 409

    blocked_daily = client.post(
        "/api/notifications",
        headers=auth_headers,
        json={"title": "Daily Brief", "type": "system"},
    )
    assert blocked_daily.status_code == 409

    blocked_weekly = client.post(
        "/api/notifications",
        headers=auth_headers,
        json={"title": "Weekly Summary", "type": "system"},
    )
    assert blocked_weekly.status_code == 409


def test_notifications_list_excludes_internal_progress_recommendations(
    client: TestClient,
    auth_headers: dict,
) -> None:
    with SessionLocal() as db:
        db.add(
            Notification(
                user_id=1,
                title="__internal_progress_coach_metric_recommendation__:habit:7",
                body='{"schema":"PROGRESS_COACH_RECOMMENDATION_V1"}',
                type=NotificationType.system,
                sent=True,
                read=True,
                created_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            Notification(
                user_id=1,
                title="Visible reminder",
                body="Ping",
                type=NotificationType.reminder,
                sent=True,
                read=False,
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    listed = client.get("/api/notifications", headers=auth_headers)
    assert listed.status_code == 200
    titles = {row["title"] for row in listed.json()}
    assert "Visible reminder" in titles
    assert all("__internal_progress_coach_metric_recommendation__" not in title for title in titles)


def test_profile_update(client: TestClient, auth_headers: dict) -> None:
    response = client.put(
        "/api/profile",
        headers=auth_headers,
        json={"name": "New Name", "theme_preference": "dark"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    assert response.json()["theme_preference"] == "dark"


def test_manual_memory_add(client: TestClient, auth_headers: dict) -> None:
    response = client.post(
        "/api/profile/memories",
        headers=auth_headers,
        json={"ai_understanding": "Prefers concise answers", "category": "personality"},
    )
    assert response.status_code == 201
    assert response.json()["source"] == "manual"
