"""Profile + settings API coverage for SCRUM-17 domain split."""

from __future__ import annotations

from datetime import datetime


def test_profile_basic_and_ai_endpoints(client, auth_headers):
    basic = client.get("/api/profile/basic", headers=auth_headers)
    assert basic.status_code == 200
    basic_json = basic.json()
    assert basic_json["email"] == "user@example.com"
    assert basic_json["name"] == "Test User"

    updated_basic = client.put(
        "/api/profile/basic",
        headers=auth_headers,
        json={
            "display_name": "Harsh",
            "current_role": "Software Engineer",
            "current_goal": "Google L3",
            "short_bio": "Building Shadow while preparing interviews.",
            "timezone": "Asia/Kolkata",
        },
    )
    assert updated_basic.status_code == 200
    updated_basic_json = updated_basic.json()
    assert updated_basic_json["display_name"] == "Harsh"
    assert updated_basic_json["current_role"] == "Software Engineer"
    assert updated_basic_json["timezone"] == "Asia/Kolkata"

    ai_profile = client.get("/api/profile/ai", headers=auth_headers)
    assert ai_profile.status_code == 200
    assert ai_profile.json()["profile_version"] == 1

    updated_ai = client.put(
        "/api/profile/ai",
        headers=auth_headers,
        json={
            "profession": "Backend Engineer",
            "primary_tech_stack": "Python, FastAPI, PostgreSQL",
            "working_style": "Time-blocking and deep work",
            "motivation": "Career growth and building products that matter",
            "always_remember": "Prefer direct, practical suggestions.",
        },
    )
    assert updated_ai.status_code == 200
    updated_ai_json = updated_ai.json()
    assert updated_ai_json["profession"] == "Backend Engineer"
    assert updated_ai_json["profile_version"] == 2


def test_memory_center_update_and_delete(client, auth_headers):
    created = client.post(
        "/api/profile/memories",
        headers=auth_headers,
        json={
            "category": "career",
            "ai_understanding": "User is preparing for Google interviews.",
            "source": "manual",
        },
    )
    assert created.status_code == 201
    memory_id = created.json()["id"]

    memory_center = client.get("/api/profile/memory-center", headers=auth_headers)
    assert memory_center.status_code == 200
    center_json = memory_center.json()
    assert len(center_json) == 1
    assert center_json[0]["value"] == "User is preparing for Google interviews."
    assert center_json[0]["confidence"] == "very_high"
    assert center_json[0]["editable"] is True
    assert "Added directly by you" in center_json[0]["why_known"]

    updated = client.put(
        f"/api/profile/memories/{memory_id}",
        headers=auth_headers,
        json={"ai_understanding": "User is preparing for Google L3 backend interviews."},
    )
    assert updated.status_code == 200
    assert updated.json()["ai_understanding"] == "User is preparing for Google L3 backend interviews."

    deleted = client.delete(f"/api/profile/memories/{memory_id}", headers=auth_headers)
    assert deleted.status_code == 204

    memory_center_after = client.get("/api/profile/memory-center", headers=auth_headers)
    assert memory_center_after.status_code == 200
    assert memory_center_after.json() == []


def test_memory_refine_endpoint(client, auth_headers):
    raw_text = "i dont like doom scrolling"
    response = client.post(
        "/api/profile/memories/refine",
        headers=auth_headers,
        json={
            "category": "personality",
            "text": raw_text,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    refined_text = payload["refined_text"]
    assert refined_text
    assert refined_text == raw_text
    assert payload["status"] == "fallback"
    assert payload["reason"]
    assert "doom scrolling" in refined_text.lower()
    assert "[fake-llm]" not in refined_text.lower()


def test_memory_refine_maintains_specifics_for_study_goal(client, auth_headers):
    raw_text = "I like to solve 10 leetcode problems t improve my DSA"
    response = client.post(
        "/api/profile/memories/refine",
        headers=auth_headers,
        json={
            "category": "career",
            "text": raw_text,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    refined_text = payload["refined_text"]
    assert refined_text
    assert refined_text == raw_text
    assert payload["status"] == "fallback"
    assert payload["reason"]
    assert "leetcode" in refined_text.lower()
    assert "10" in refined_text
    assert "dsa" in refined_text.lower() or "data structure" in refined_text.lower()
    assert "[fake-llm]" not in refined_text.lower()


def test_settings_endpoints_and_theme_sync(client, auth_headers):
    initial = client.get("/api/settings", headers=auth_headers)
    assert initial.status_code == 200
    initial_json = initial.json()
    assert "appearance" in initial_json
    assert "notifications" in initial_json
    assert "ai_behavior" in initial_json
    assert "planner" in initial_json
    assert "privacy" in initial_json
    assert "integrations" in initial_json
    assert "accessibility" in initial_json

    appearance = client.put(
        "/api/settings/appearance",
        headers=auth_headers,
        json={"theme_preference": "dark"},
    )
    assert appearance.status_code == 200
    assert appearance.json()["appearance"]["theme_preference"] == "dark"

    me = client.get("/api/auth/me", headers=auth_headers)
    assert me.status_code == 200
    assert me.json()["theme_preference"] == "dark"

    notifications = client.put(
        "/api/settings/notifications",
        headers=auth_headers,
        json={
            "daily_brief_enabled": False,
            "daily_brief_time": "09:30",
            "email_notifications_enabled": True,
            "weekly_summary_enabled": False,
        },
    )
    assert notifications.status_code == 200
    notifications_json = notifications.json()["notifications"]
    assert notifications_json["daily_brief_enabled"] is False
    assert notifications_json["daily_brief_time"] == "09:30"
    assert notifications_json["email_notifications_enabled"] is True
    assert notifications_json["weekly_summary_enabled"] is False

    ai_behavior = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={
            "ai_response_length": "detailed",
            "ai_personality": "mentor",
            "ai_default_model": "gemini-2.5-flash",
        },
    )
    assert ai_behavior.status_code == 200
    assert ai_behavior.json()["ai_behavior"]["ai_response_length"] == "detailed"
    assert ai_behavior.json()["ai_behavior"]["ai_personality"] == "mentor"
    assert ai_behavior.json()["ai_behavior"]["ai_default_model"] == "gemini-2.5-flash"

    ai_behavior_alias = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={"ai_default_model": "Gemini 3.5"},
    )
    assert ai_behavior_alias.status_code == 200
    assert ai_behavior_alias.json()["ai_behavior"]["ai_default_model"] == "gemini-3.5"

    ai_behavior_retired = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={"ai_default_model": "gemini-1.5-pro"},
    )
    assert ai_behavior_retired.status_code == 200
    assert ai_behavior_retired.json()["ai_behavior"]["ai_default_model"] == "gemini-2.5-flash"

    ai_behavior_retired_v2 = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={"ai_default_model": "gemini-2.0-flash-lite"},
    )
    assert ai_behavior_retired_v2.status_code == 200
    assert ai_behavior_retired_v2.json()["ai_behavior"]["ai_default_model"] == "gemini-2.5-flash"

    integrations = client.put(
        "/api/settings/integrations",
        headers=auth_headers,
        json={"google_calendar_enabled": True, "slack_enabled": True},
    )
    assert integrations.status_code == 200
    assert integrations.json()["integrations"]["google_calendar_enabled"] is True
    assert integrations.json()["integrations"]["slack_enabled"] is True

    accessibility = client.put(
        "/api/settings/accessibility",
        headers=auth_headers,
        json={"reduced_motion": True, "high_contrast": True, "font_scale_percent": 115},
    )
    assert accessibility.status_code == 200
    assert accessibility.json()["accessibility"]["reduced_motion"] is True
    assert accessibility.json()["accessibility"]["high_contrast"] is True
    assert accessibility.json()["accessibility"]["font_scale_percent"] == 115


def test_dynamic_appearance_resolve_returns_effective_theme(client, auth_headers, monkeypatch):
    from app.services import settings_service

    def fake_fetch(*, latitude: float, longitude: float):
        assert latitude == 28.6139
        assert longitude == 77.209
        return {
            "timezone": "Asia/Kolkata",
            "current": {"is_day": 0},
            "daily": {
                "time": ["2026-07-07", "2026-07-08"],
                "sunrise": ["2026-07-07T05:28", "2026-07-08T05:29"],
                "sunset": ["2026-07-07T19:22", "2026-07-08T19:22"],
            },
        }

    monkeypatch.setattr(settings_service, "_fetch_open_meteo_dynamic_payload", fake_fetch)

    response = client.get(
        "/api/settings/appearance/dynamic-resolve",
        headers=auth_headers,
        params={"latitude": 28.6139, "longitude": 77.2090},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["effective_theme"] == "dark"
    assert payload["timezone"] == "Asia/Kolkata"
    assert payload["source"] == "open_meteo"
    assert datetime.fromisoformat(payload["sunrise"])
    assert datetime.fromisoformat(payload["sunset"])
    assert datetime.fromisoformat(payload["next_transition_at"])


def test_dynamic_appearance_resolve_rejects_invalid_coordinates(client, auth_headers):
    response = client.get(
        "/api/settings/appearance/dynamic-resolve",
        headers=auth_headers,
        params={"latitude": 120.0, "longitude": 77.2},
    )
    assert response.status_code == 400
    assert "Latitude must be between -90 and 90" in response.json()["detail"]


def test_account_security_export_and_clear_chat(client, auth_headers):
    account = client.get("/api/profile/account", headers=auth_headers)
    assert account.status_code == 200
    account_json = account.json()
    assert account_json["auth_provider"] == "password"
    assert account_json["subscription_plan"] == "free"

    change_password = client.post(
        "/api/profile/change-password",
        headers=auth_headers,
        json={"current_password": "password123", "new_password": "new-password-123"},
    )
    assert change_password.status_code == 200

    relogin = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "new-password-123"},
    )
    assert relogin.status_code == 200

    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Cleanup"},
    )
    assert session.status_code == 201
    session_id = session.json()["id"]
    sent = client.post(
        f"/api/chat/sessions/{session_id}/messages",
        headers=auth_headers,
        json={"content": "hello"},
    )
    assert sent.status_code == 200

    export = client.get("/api/profile/export", headers=auth_headers)
    assert export.status_code == 200
    assert "counts" in export.json()["data"]

    clear = client.post("/api/profile/clear-chat-history", headers=auth_headers)
    assert clear.status_code == 200
    assert clear.json()["deleted_sessions"] >= 1
    assert clear.json()["deleted_messages"] >= 2


def test_delete_account_requires_confirmation_text(client, auth_headers):
    bad = client.request(
        "DELETE",
        "/api/profile/account",
        headers=auth_headers,
        json={"confirmation_text": "NO"},
    )
    assert bad.status_code == 409

    ok = client.request(
        "DELETE",
        "/api/profile/account",
        headers=auth_headers,
        json={"confirmation_text": "DELETE"},
    )
    assert ok.status_code == 200

    me_after_delete = client.get("/api/auth/me", headers=auth_headers)
    assert me_after_delete.status_code == 401
