"""Journal, notifications, and profile API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_journal_crud(client: TestClient, auth_headers: dict) -> None:
    created = client.post(
        "/api/journal",
        headers=auth_headers,
        json={"content": "Today was productive", "mood": "good"},
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]

    assert len(client.get("/api/journal", headers=auth_headers).json()) == 1

    updated = client.put(
        f"/api/journal/{entry_id}", headers=auth_headers, json={"content": "edited"}
    )
    assert updated.json()["content"] == "edited"

    assert client.delete(f"/api/journal/{entry_id}", headers=auth_headers).status_code == 204


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
