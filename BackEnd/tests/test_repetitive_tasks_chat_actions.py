"""Chat action integration tests for repetitive task execution."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.api.deps import get_provider
from app.llm.base import LLMMessage, LLMProvider
from app.main import app


class RepetitiveTaskActionProvider(LLMProvider):
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
                '"actions":[{"module":"repetitive_tasks","type":"repetitive_tasks.create_task",'
                '"title":"Add repetitive task: Workout routine",'
                '"rationale":"User requested a recurring workout schedule.",'
                '"confidence":"high",'
                '"requires_confirmation":false,'
                '"destructive":false,'
                '"args":{"name":"Workout routine","description":"Maintain consistency.",' 
                '"frequencies":["monday","wednesday","friday"],"priority":"high"}}]'
                "}"
            )
        return "Done. I can turn that into a recurring task."


def test_chat_action_executes_repetitive_task_creation(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = RepetitiveTaskActionProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        session = client.post(
            "/api/chat/sessions",
            headers=auth_headers,
            json={"agent_type": "general", "title": "Repetitive Task Setup"},
        )
        assert session.status_code == 201
        session_id = session.json()["id"]

        sent = client.post(
            f"/api/chat/sessions/{session_id}/messages",
            headers=auth_headers,
            json={"content": "I want to workout every Monday, Wednesday and Friday."},
        )
        assert sent.status_code == 200
        body = sent.json()

        action = next(
            item
            for item in body["proposed_actions"]
            if item["type"] == "repetitive_tasks.create_task"
        )

        executed = client.post(
            f"/api/chat/sessions/{session_id}/actions/execute",
            headers=auth_headers,
            json={"action": action, "confirmed": False},
        )
        assert executed.status_code == 200
        execution = executed.json()
        assert execution["status"] == "executed"
        assert execution["link"] == "/repetitive-tasks"

        tasks = client.get("/api/repetitive-tasks", headers=auth_headers)
        assert tasks.status_code == 200
        assert any(task["name"] == "Workout routine" for task in tasks.json())
    finally:
        app.dependency_overrides.pop(get_provider, None)
