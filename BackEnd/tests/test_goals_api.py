"""Goals & milestones API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _create_goal(client: TestClient, headers: dict) -> int:
    response = client.post(
        "/api/goals",
        headers=headers,
        json={"title": "Learn system design", "category": "career"},
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_create_and_list_goals(client: TestClient, auth_headers: dict) -> None:
    goal_id = _create_goal(client, auth_headers)
    listing = client.get("/api/goals", headers=auth_headers).json()
    assert any(g["id"] == goal_id for g in listing)


def test_update_goal(client: TestClient, auth_headers: dict) -> None:
    goal_id = _create_goal(client, auth_headers)
    response = client.put(
        f"/api/goals/{goal_id}",
        headers=auth_headers,
        json={"status": "paused", "progress": 25},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "paused"
    assert response.json()["progress"] == 25


def test_milestone_completion_updates_progress(client: TestClient, auth_headers: dict) -> None:
    goal_id = _create_goal(client, auth_headers)
    m1 = client.post(
        f"/api/goals/{goal_id}/milestones",
        headers=auth_headers,
        json={"title": "Read DDIA"},
    ).json()
    client.post(
        f"/api/goals/{goal_id}/milestones",
        headers=auth_headers,
        json={"title": "Do mock interview"},
    )

    # Complete one of two milestones → progress should be 50%.
    client.put(
        f"/api/milestones/{m1['id']}",
        headers=auth_headers,
        json={"status": "done"},
    )
    goal = client.get(f"/api/goals/{goal_id}", headers=auth_headers).json()
    assert goal["progress"] == 50
    assert len(goal["milestones"]) == 2


def test_delete_goal(client: TestClient, auth_headers: dict) -> None:
    goal_id = _create_goal(client, auth_headers)
    assert client.delete(f"/api/goals/{goal_id}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/goals/{goal_id}", headers=auth_headers).status_code == 404


def test_cannot_access_other_users_goal(client: TestClient, auth_headers: dict) -> None:
    goal_id = _create_goal(client, auth_headers)
    from tests.conftest import register_and_login

    other = register_and_login(client, email="other@example.com")
    assert client.get(f"/api/goals/{goal_id}", headers=other).status_code == 404
