"""Goals & milestones API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.deps import get_provider
from app.llm.base import LLMMessage, LLMProvider
from app.main import app


class GoalDraftProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        return (
            "```json\n"
            "{"
            '"title":"Get SDE role at Google",'
            '"description":"Prepare DSA and interview readiness for Google SDE opportunities.",'
            '"category":"Career",'
            '"target_date":"2026-12-31"'
            "}"
            "\n```"
        )


class BrokenGoalDraftProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        return "not-json"


class RecoverableGoalDraftProvider(LLMProvider):
    def __init__(self) -> None:
        self.calls = 0

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        self.calls += 1
        if self.calls == 1:
            return "Sure, here's a draft goal in plain text."
        return (
            "{"
            '"title":"Build a stable productivity routine",'
            '"description":"Create a daily structure that improves focus and consistency.",'
            '"category":"Productivity",'
            '"target_date":null'
            "}"
        )


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


def test_goal_draft_from_prompt_returns_structured_fields(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalDraftProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        response = client.post(
            "/api/goals/draft",
            headers=auth_headers,
            json={"prompt": "I want to get SDE job at Google"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["title"] == "Get SDE role at Google"
        assert body["category"] == "Career"
        assert body["description"]
        assert body["target_date"] is not None
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_draft_recovers_with_ai_json_repair_when_first_output_is_not_json(
    client: TestClient, auth_headers: dict
) -> None:
    provider = RecoverableGoalDraftProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        response = client.post(
            "/api/goals/draft",
            headers=auth_headers,
            json={"prompt": "I want to improve my routine and focus"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["title"] == "Build a stable productivity routine"
        assert body["category"] == "Productivity"
        assert body["target_date"] is None
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_draft_returns_400_when_model_output_is_not_structured_json(
    client: TestClient, auth_headers: dict
) -> None:
    provider = BrokenGoalDraftProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        response = client.post(
            "/api/goals/draft",
            headers=auth_headers,
            json={"prompt": "I want to improve my career"},
        )
        assert response.status_code == 400
        assert "could not structure" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_provider, None)


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
