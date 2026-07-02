"""Profile + settings API coverage for SCRUM-17 domain split."""

from __future__ import annotations


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
        },
    )
    assert notifications.status_code == 200
    notifications_json = notifications.json()["notifications"]
    assert notifications_json["daily_brief_enabled"] is False
    assert notifications_json["daily_brief_time"] == "09:30"
    assert notifications_json["email_notifications_enabled"] is True

    ai_behavior = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={"ai_response_length": "detailed", "ai_personality": "mentor"},
    )
    assert ai_behavior.status_code == 200
    assert ai_behavior.json()["ai_behavior"]["ai_response_length"] == "detailed"
    assert ai_behavior.json()["ai_behavior"]["ai_personality"] == "mentor"
