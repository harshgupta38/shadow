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


class CountingProvider(LLMProvider):
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
        return "Model response"


class GoalFocusEchoProvider(LLMProvider):
    def generate(
        self,
        messages: list[LLMMessage],
        *,
        system: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        model: str | None = None,
    ) -> str:
        if system:
            for line in system.splitlines():
                if line.startswith("- Goal title: "):
                    goal_title = line.split(":", 1)[1].strip()
                    return f"Using goal: {goal_title}"
        return "No goal focus"


class GoalBreakdownProvider(LLMProvider):
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
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Google Milestones"
        return (
            "1. Solidify DSA Foundations\n"
            "o Target: Complete 75% of your Coding Ninja DSA course and solve 250 LeetCode problems.\n"
            "o Why: Builds the essential problem-solving skills Google looks for.\n"
            "o Est. Completion: 6 months\n"
            "2. Master Advanced DSA & System Design Basics\n"
            "o Target: Solve 200 medium/hard DSA problems and finish a system design course.\n"
            "o Why: Crucial for tackling higher-complexity interview rounds.\n"
            "o Est. Completion: 6-8 months\n"
            "3. Build & Apply\n"
            "o Target: Build 2 projects and solve 10 system design case studies.\n"
            "o Why: Demonstrates practical application of your skills.\n"
            "o Est. Completion: 6-8 months\n"
            "4. Interview Ready\n"
            "o Target: Complete 5+ mock interviews and apply to Google.\n"
            "o Why: Converts preparation into offer-ready interview performance.\n"
            "o Est. Completion: 3-4 months"
        )


class BulletMilestoneBreakdownProvider(LLMProvider):
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
        if "MILESTONE_OBJECT_ARRAY_EXTRACTOR_V1" in prompt:
            return (
                "{"
                '"milestones":[\n'
                '{"title":"Lose 2KG by July 11","due_date":"2026-07-11","details":[]},'
                '{"title":"Lose 2KG by August 11 (Total 4KG lost)","due_date":"2026-08-11","details":[]},'
                '{"title":"Lose 2KG by September 11 (Total 6KG lost)","due_date":"2026-09-11","details":[]},'
                '{"title":"Lose 2KG by October 11 (Total 8KG lost)","due_date":"2026-10-11","details":[]},'
                '{"title":"Lose 2KG by October 31 (Total 10KG lost)","due_date":"2026-10-31","details":[]}'
                "]}"
            )
        if "Return valid JSON only" in prompt:
            return '{"actions":[]}'
        if max_tokens == 24:
            return "Weight Loss Milestones"
        return (
            "Here are milestones to help you lose 10KG by October end:\n"
            "• Milestone 1: By June 30th - Lose 2KG.\n"
            "• Milestone 2: By July 31st - Lose another 2KG (total 4KG).\n"
            "• Milestone 3: By August 31st - Lose another 2KG (total 6KG).\n"
            "• Milestone 4: By September 30th - Lose another 2KG (total 8KG).\n"
            "• Milestone 5: By October 31st - Achieve your 10KG weight loss goal.\n"
            "Next action: Weigh yourself and record your current weight to establish a baseline."
        )


class ProposalFailureFallbackProvider(LLMProvider):
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
            raise RuntimeError("proposal generation failed")
        if "MILESTONE_OBJECT_ARRAY_EXTRACTOR_V1" in prompt:
            return '{"milestones":[]}'
        if max_tokens == 24:
            return "SDE Milestones"
        return (
            "Here are three milestones to guide your progress toward getting an SDE 1 job at Google:\n"
            "1. DSA Mastery: Complete 300 LeetCode problems by August 31, 2024.\n"
            "2. System Design Fundamentals: Master core system design concepts by October 31, 2024.\n"
            "3. Frontend Deep Dive & Interview Readiness: Build 2 complex Angular projects by December 31, 2024.\n"
            "Let's focus on the first milestone."
        )


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


def test_goal_coach_session_can_persist_goal_id(client: TestClient, auth_headers: dict) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Crack Google"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
    )
    assert session.status_code == 201
    body = session.json()
    assert body["goal_id"] == goal_id
    assert body["title"] == "Crack Google"


def test_non_goal_coach_session_rejects_goal_id(
    client: TestClient, auth_headers: dict
) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Crack Google"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    session = client.post(
        "/api/chat/sessions",
        headers=auth_headers,
        json={"agent_type": "general", "title": "General", "goal_id": goal_id},
    )
    assert session.status_code == 400
    assert "goal_id" in session.json()["detail"]


def test_goal_coach_session_goal_id_enforces_ownership(
    client: TestClient, auth_headers: dict
) -> None:
    goal = client.post(
        "/api/goals",
        headers=auth_headers,
        json={"title": "Crack Google"},
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]

    client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "name": "Other"},
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "other@example.com", "password": "password123"},
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    session = client.post(
        "/api/chat/sessions",
        headers=other_headers,
        json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
    )
    assert session.status_code == 404


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


def test_goal_coach_asks_which_goal_when_multiple_active_goals(
    client: TestClient, auth_headers: dict
) -> None:
    provider = CountingProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach"},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goals into milestones"},
        )
        assert response.status_code == 200
        content = response.json()["assistant_message"]["content"]
        assert "multiple goals" in content.lower()
        assert "Crack Google" in content
        assert "Lose 10kg weight" in content
        assert provider.calls == 0
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_prefers_session_goal_id_when_multiple_goals_exist(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalFocusEchoProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        google_id = google_goal.json()["id"]
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": google_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goals into milestones"},
        )
        assert response.status_code == 200
        assert response.json()["assistant_message"]["content"] == "Using goal: Crack Google"
        assert response.json()["session"]["goal_id"] == google_id
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_attaches_session_goal_context_on_non_breakdown_messages(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalFocusEchoProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        google_id = google_goal.json()["id"]
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": google_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "How am I doing this week?"},
        )
        assert response.status_code == 200
        assert response.json()["assistant_message"]["content"] == "Using goal: Crack Google"
        assert response.json()["session"]["goal_id"] == google_id
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_ignores_deleted_session_goal_and_uses_remaining_goal(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalFocusEchoProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        google_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Crack Google"},
        )
        weight_goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10kg weight"},
        )
        assert google_goal.status_code == 201
        assert weight_goal.status_code == 201

        google_id = google_goal.json()["id"]
        weight_id = weight_goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": google_id},
        ).json()

        deleted = client.delete(f"/api/goals/{google_id}", headers=auth_headers)
        assert deleted.status_code == 204

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goals into milestones"},
        )
        assert response.status_code == 200
        assert response.json()["assistant_message"]["content"] == "Using goal: Lose 10kg weight"
        assert response.json()["session"]["goal_id"] == weight_id

        messages = client.get(
            f"/api/chat/sessions/{session['id']}/messages", headers=auth_headers
        )
        assert messages.status_code == 200
        assert messages.json()[0]["content"] == "Break my goals into milestones"
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_returns_goal_linked_milestone_actions(
    client: TestClient, auth_headers: dict
) -> None:
    provider = GoalBreakdownProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 4
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)
        assert all(item["confidence"] == "high" for item in milestone_actions)
        assert all(item["requires_confirmation"] is False for item in milestone_actions)
        action_by_title = {item["args"]["title"]: item for item in milestone_actions}
        assert "Target:" in action_by_title["Solidify DSA Foundations"]["args"]["description"]
        assert "Why:" in action_by_title["Solidify DSA Foundations"]["args"]["description"]
        assert "Est. Completion:" in action_by_title["Solidify DSA Foundations"]["args"]["description"]

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_by_title = {item["title"]: item for item in milestones.json()}
        assert "Solidify DSA Foundations" in milestone_by_title
        assert "Master Advanced DSA & System Design Basics" in milestone_by_title
        assert "Build & Apply" in milestone_by_title
        assert "Interview Ready" in milestone_by_title
        assert "Target:" in (milestone_by_title["Solidify DSA Foundations"]["description"] or "")
        assert "Why:" in (milestone_by_title["Solidify DSA Foundations"]["description"] or "")
        assert "Est. Completion:" in (
            milestone_by_title["Solidify DSA Foundations"]["description"] or ""
        )
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_saves_bullet_milestone_format(
    client: TestClient, auth_headers: dict
) -> None:
    provider = BulletMilestoneBreakdownProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Lose 10KG weight by October end"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 5
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)
        assert all(
            "first step" not in ((item["args"].get("description") or "").lower())
            for item in milestone_actions
        )

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_by_title = {item["title"]: item for item in milestones.json()}
        assert "Lose 2KG by July 11" in milestone_by_title
        assert "Lose 2KG by August 11 (Total 4KG lost)" in milestone_by_title
        assert "Lose 2KG by September 11 (Total 6KG lost)" in milestone_by_title
        assert "Lose 2KG by October 11 (Total 8KG lost)" in milestone_by_title
        assert "Lose 2KG by October 31 (Total 10KG lost)" in milestone_by_title
        assert all(
            "first step" not in ((item["description"] or "").lower())
            for item in milestone_by_title.values()
        )
        assert all(item.get("details") in (None, []) for item in milestone_by_title.values())
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_breakdown_still_saves_when_action_proposal_fails(
    client: TestClient, auth_headers: dict
) -> None:
    provider = ProposalFailureFallbackProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        goal = client.post(
            "/api/goals",
            headers=auth_headers,
            json={"title": "Get SDE 1 job at Google"},
        )
        assert goal.status_code == 201
        goal_id = goal.json()["id"]

        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "goal_coach", "title": "Goal Coach", "goal_id": goal_id},
        ).json()

        response = client.post(
            f"/api/chat/sessions/{session['id']}/messages",
            headers=auth_headers,
            json={"content": "Break my goal into milestones"},
        )
        assert response.status_code == 200

        actions = response.json()["proposed_actions"]
        milestone_actions = [item for item in actions if item["type"] == "goals.add_milestone"]
        assert len(milestone_actions) == 3
        assert all(item["args"]["goal_id"] == goal_id for item in milestone_actions)

        for action in milestone_actions:
            executed = client.post(
                f"/api/chat/sessions/{session['id']}/actions/execute",
                headers=auth_headers,
                json={"confirmed": False, "action": action},
            )
            assert executed.status_code == 200
            assert executed.json()["status"] == "executed"

        milestones = client.get(f"/api/goals/{goal_id}/milestones", headers=auth_headers)
        assert milestones.status_code == 200
        milestone_titles = {item["title"] for item in milestones.json()}
        assert "DSA Mastery: Complete 300 LeetCode problems by August 31, 2024." in milestone_titles
        assert "System Design Fundamentals: Master core system design concepts by October 31, 2024." in milestone_titles
        assert (
            "Frontend Deep Dive & Interview Readiness: Build 2 complex Angular projects by December 31, 2024."
            in milestone_titles
        )
    finally:
        app.dependency_overrides.pop(get_provider, None)
