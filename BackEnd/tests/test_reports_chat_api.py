"""Reports & chat API tests (fake LLM provider)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.api.deps import get_provider
from app.llm.base import LLMMessage, LLMProvider
from app.main import app


class ModelCaptureProvider(LLMProvider):
    def __init__(self) -> None:
        self.models: list[str | None] = []

    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        self.models.append(model)
        return "Captured response"


class TitleProvider(LLMProvider):
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
        if max_tokens == 24:
            return "Morning Workout Plan"
        return "Assistant response"


class ActionProposalProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        prompt = messages[-1].content if messages else ""
        if "Return valid JSON only" in prompt:
            return (
                "{"
                '"actions":[{"module":"plan","type":"plan.create_task",'
                '"title":"Add deep work block",'
                '"rationale":"The user asked to schedule focused work.",'
                '"confidence":"high",'
                '"requires_confirmation":false,'
                '"destructive":false,'
                f'"args":{{"title":"Deep Work Session","date":"{date.today().isoformat()}"}}'
                "}]"
                "}"
            )
        return "Assistant response"


def test_generate_daily_report(client: TestClient, auth_headers: dict) -> None:
    # Log some activity so the report has data.
    metrics = client.get("/api/metrics", headers=auth_headers).json()
    metric_id = metrics[0]["id"]
    client.post(
        f"/api/metrics/{metric_id}/logs",
        headers=auth_headers,
        json={"value": 120, "date": date.today().isoformat()},
    )

    response = client.post(
        "/api/reports/generate", headers=auth_headers, json={"period": "daily"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["period"] == "daily"
    assert body["narrative"]
    assert body["next_steps"]
    assert "metrics" in body["metrics_json"]

    listing = client.get("/api/reports?period=daily", headers=auth_headers).json()
    assert len(listing) == 1


def test_chat_round_trip(client: TestClient, auth_headers: dict) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Hi"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/messages",
        headers=auth_headers,
        json={"content": "How should I plan my day?"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user_message"]["role"] == "user"
    assert body["assistant_message"]["role"] == "assistant"
    assert body["assistant_message"]["content"]
    assert body["session"]["id"] == session["id"]
    assert isinstance(body["proposed_actions"], list)

    messages = client.get(
        f"/api/chat/sessions/{session['id']}/messages", headers=auth_headers
    ).json()
    assert len(messages) == 2


def test_report_next_steps_respect_ai_suggestions_setting(
    client: TestClient, auth_headers: dict
) -> None:
    toggled = client.put(
        "/api/settings/ai-behavior",
        headers=auth_headers,
        json={"ai_suggestions_enabled": False},
    )
    assert toggled.status_code == 200

    report = client.post(
        "/api/reports/generate",
        headers=auth_headers,
        json={"period": "daily"},
    )
    assert report.status_code == 200
    assert report.json()["next_steps"] == "Suggestions are disabled in AI behavior settings."


def test_chat_uses_normalized_model_override(client: TestClient, auth_headers: dict) -> None:
    provider = ModelCaptureProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        updated = client.put(
            "/api/settings/ai-behavior",
            headers=auth_headers,
            json={"ai_default_model": "Gemini 3.5"},
        )
        assert updated.status_code == 200
        assert updated.json()["ai_behavior"]["ai_default_model"] == "gemini-3.5"

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Model check"},
        ).json()
        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "hello"},
        )

        assert response.status_code == 200
        assert provider.models
        assert provider.models[-1] == "gemini-3.5"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_delete_chat_session_removes_session_and_messages(
    client: TestClient, auth_headers: dict
) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Disposable"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/messages",
        headers=auth_headers,
        json={"content": "hello"},
    )
    assert response.status_code == 200

    deleted = client.delete(f"/api/chat/sessions/{session['id']}", headers=auth_headers)
    assert deleted.status_code == 204

    sessions = client.get("/api/chat/sessions", headers=auth_headers).json()
    assert all(item["id"] != session["id"] for item in sessions)

    messages = client.get(
        f"/api/chat/sessions/{session['id']}/messages", headers=auth_headers
    )
    assert messages.status_code == 404


def test_delete_chat_session_enforces_ownership(client: TestClient, auth_headers: dict) -> None:
    owned = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Private"},
    ).json()

    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "name": "Other"},
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "other@example.com", "password": "password123"},
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    deleted = client.delete(f"/api/chat/sessions/{owned['id']}", headers=other_headers)
    assert deleted.status_code == 404


def test_delete_chat_session_does_not_delete_goals(
    client: TestClient, auth_headers: dict
) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Keep this goal"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Delete me"},
    ).json()
    deleted = client.delete(f"/api/chat/sessions/{session['id']}", headers=auth_headers)
    assert deleted.status_code == 204

    goals = client.get("/api/goals", headers=auth_headers)
    assert goals.status_code == 200
    assert any(item["id"] == goal_id for item in goals.json())


def test_chat_auto_generates_contextual_title(client: TestClient, auth_headers: dict) -> None:
    provider = TitleProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Shadow"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Plan a consistent morning workout routine"},
        )
        assert response.status_code == 200
        assert response.json()["session"]["title"] == "Morning Workout Plan"
        assert provider.calls == 3

        sessions = client.get("/api/chat/sessions", headers=auth_headers)
        assert sessions.status_code == 200
        assert sessions.json()[0]["title"] == "Morning Workout Plan"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_chat_keeps_custom_title(client: TestClient, auth_headers: dict) -> None:
    provider = TitleProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Career Notes"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Help me prep for interviews"},
        )
        assert response.status_code == 200
        assert response.json()["session"]["title"] == "Career Notes"
        assert provider.calls == 2
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_chat_returns_structured_proposed_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = ActionProposalProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "My planning chat"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Please schedule a deep work block for today."},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        assert len(actions) == 1
        assert actions[0]["type"] == "plan.create_task"
        assert actions[0]["module"] == "plan"
        assert actions[0]["requires_confirmation"] is False
        assert actions[0]["confidence"] == "high"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_execute_action_creates_plan_task(client: TestClient, auth_headers: dict) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Executor"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": False,
            "action": {
                "id": "act-plan-1",
                "module": "plan",
                "type": "plan.create_task",
                "title": "Create stretch task",
                "rationale": "Useful next step",
                "confidence": "high",
                "requires_confirmation": False,
                "destructive": False,
                "args": {
                    "title": "Stretch for 15 minutes",
                    "date": date.today().isoformat(),
                },
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "executed"
    assert body["link"] == "/plan"

    tasks = client.get("/api/plan", headers=auth_headers)
    assert tasks.status_code == 200
    assert any(item["title"] == "Stretch for 15 minutes" for item in tasks.json())


def test_execute_action_requires_confirmation(client: TestClient, auth_headers: dict) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Executor"},
    ).json()

    response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": False,
            "action": {
                "id": "act-plan-2",
                "module": "plan",
                "type": "plan.create_task",
                "title": "Create uncertain task",
                "rationale": "Could help",
                "confidence": "medium",
                "requires_confirmation": True,
                "destructive": False,
                "args": {
                    "title": "Read one chapter",
                    "date": date.today().isoformat(),
                },
            },
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"

    tasks = client.get("/api/plan", headers=auth_headers)
    assert tasks.status_code == 200
    assert all(item["title"] != "Read one chapter" for item in tasks.json())


def test_execute_action_supports_goals_and_track_modules(
    client: TestClient, auth_headers: dict
) -> None:
    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "Executor"},
    ).json()

    goal_response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": True,
            "action": {
                "id": "act-goal-1",
                "module": "goals",
                "type": "goals.create_goal",
                "title": "Create interview goal",
                "rationale": "User asked for a new goal",
                "confidence": "high",
                "requires_confirmation": False,
                "destructive": False,
                "args": {
                    "title": "Prepare for backend interviews",
                    "description": "Focus on DSA and system design",
                    "category": "career",
                },
            },
        },
    )
    assert goal_response.status_code == 200
    goal_body = goal_response.json()
    assert goal_body["status"] == "executed"
    assert goal_body["entity_id"] is not None

    metrics = client.get("/api/metrics", headers=auth_headers)
    assert metrics.status_code == 200
    deep_work = next(item for item in metrics.json() if item["key"] == "deep_work_minutes")

    log_response = client.post(
        f"/api/chat/sessions/{session['id']}/actions/execute",
        headers=auth_headers,
        json={
            "confirmed": False,
            "action": {
                "id": "act-track-1",
                "module": "track",
                "type": "track.log_metric",
                "title": "Log deep work",
                "rationale": "User reported focused time",
                "confidence": "high",
                "requires_confirmation": False,
                "destructive": False,
                "args": {
                    "key": "deep_work_minutes",
                    "value": 45,
                    "date": date.today().isoformat(),
                    "note": "Focused coding session",
                },
            },
        },
    )
    assert log_response.status_code == 200
    assert log_response.json()["status"] == "executed"

    logs = client.get(f"/api/metrics/{deep_work['id']}/logs", headers=auth_headers)
    assert logs.status_code == 200
    assert any(entry["value"] == 45 for entry in logs.json())
