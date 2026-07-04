"""Repetitive task API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import register_and_login


def _create_goal(client: TestClient, headers: dict[str, str], title: str = "Google prep") -> int:
    response = client.post(
        "/api/goals",
        headers=headers,
        json={"title": title, "category": "Career"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def _create_metric(
    client: TestClient,
    headers: dict[str, str],
    *,
    key: str,
    label: str,
) -> int:
    response = client.post(
        "/api/metrics",
        headers=headers,
        json={"key": key, "label": label, "unit": "count"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def test_create_update_list_and_delete_repetitive_task(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    goal_id = _create_goal(client, auth_headers, "Google Interview")
    metric_id = _create_metric(
        client,
        auth_headers,
        key="leetcode_solved",
        label="LeetCode solved",
    )

    created = client.post(
        "/api/repetitive-tasks",
        headers=auth_headers,
        json={
            "name": "LeetCode practice",
            "description": "Daily DSA reps",
            "frequencies": ["weekdays"],
            "priority": "critical",
            "linked_goal_ids": [goal_id],
            "linked_metric_ids": [metric_id],
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "LeetCode practice"
    assert body["status"] == "active"
    assert body["linked_goal_ids"] == [goal_id]
    assert body["linked_metric_ids"] == [metric_id]

    task_id = body["id"]

    listing = client.get("/api/repetitive-tasks", headers=auth_headers)
    assert listing.status_code == 200
    assert any(item["id"] == task_id for item in listing.json())

    updated = client.put(
        f"/api/repetitive-tasks/{task_id}",
        headers=auth_headers,
        json={
            "status": "paused",
            "frequencies": ["monday", "wednesday", "friday"],
            "linked_goal_ids": [],
            "linked_metric_ids": [metric_id],
        },
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["status"] == "paused"
    assert updated_body["frequencies"] == ["monday", "wednesday", "friday"]
    assert updated_body["linked_goal_ids"] == []
    assert updated_body["linked_metric_ids"] == [metric_id]

    paused_listing = client.get(
        "/api/repetitive-tasks",
        headers=auth_headers,
        params={"status": "paused"},
    )
    assert paused_listing.status_code == 200
    assert len(paused_listing.json()) == 1
    assert paused_listing.json()[0]["id"] == task_id

    deleted = client.delete(f"/api/repetitive-tasks/{task_id}", headers=auth_headers)
    assert deleted.status_code == 204

    final_listing = client.get("/api/repetitive-tasks", headers=auth_headers)
    assert final_listing.status_code == 200
    assert final_listing.json() == []


def test_repetitive_task_links_must_be_owned(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    goal_id = _create_goal(client, auth_headers, "Private goal")
    other_headers = register_and_login(client, email="other@example.com")

    response = client.post(
        "/api/repetitive-tasks",
        headers=other_headers,
        json={
            "name": "Unauthorized link",
            "frequencies": ["daily"],
            "priority": "medium",
            "linked_goal_ids": [goal_id],
        },
    )
    assert response.status_code == 404


def test_repetitive_task_recommendations_are_api_backed_and_skip_existing(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    _create_goal(client, auth_headers, "Join Google")
    _create_metric(
        client,
        auth_headers,
        key="leetcode_solved",
        label="LeetCode solved",
    )

    initial = client.get("/api/repetitive-tasks/recommendations", headers=auth_headers)
    assert initial.status_code == 200
    recommendations = initial.json()
    assert len(recommendations) > 0
    assert all(len(item["frequencies"]) > 0 for item in recommendations)

    first_name = recommendations[0]["name"]
    created = client.post(
        "/api/repetitive-tasks",
        headers=auth_headers,
        json={
            "name": first_name,
            "frequencies": ["daily"],
            "priority": "medium",
        },
    )
    assert created.status_code == 201

    refreshed = client.get("/api/repetitive-tasks/recommendations", headers=auth_headers)
    assert refreshed.status_code == 200
    refreshed_names = {item["name"] for item in refreshed.json()}
    assert first_name not in refreshed_names
