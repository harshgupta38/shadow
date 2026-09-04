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


class GoalRepetitivePlanProvider(LLMProvider):
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

        return (
            "Here is a practical repetitive routine aligned to your milestones:\n"
            "Daily:\n"
            "- 90-minute DSA block: Solve 2 focused problems and review mistakes.\n"
            "Weekly:\n"
            "- Mock interview: Run one timed mock and write takeaways.\n"
            "- Project shipping checkpoint: Push one meaningful improvement to your portfolio project."
        )


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


def test_goal_repetitive_seed_synthesizes_saveable_repetitive_actions(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = GoalRepetitivePlanProvider()
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
        )
        assert session.status_code == 201
        session_id = session.json()["id"]

        sent = client.post(
            f"/api/chat/sessions/{session_id}/messages",
            headers=auth_headers,
            json={
                "content": (
                    "[goal_repetitive_seed] Based on my current goal and existing milestones, "
                    "propose repetitive tasks I should do daily/weekly to reach the milestones."
                )
            },
        )
        assert sent.status_code == 200

        actions = [
            item
            for item in sent.json()["proposed_actions"]
            if item["type"] == "repetitive_tasks.create_task"
        ]
        assert len(actions) == 3
        assert all(item["confidence"] == "medium" for item in actions)
        assert all(item["requires_confirmation"] is False for item in actions)
        assert all(item["destructive"] is False for item in actions)
        assert all(goal_id in item["args"].get("linked_goal_ids", []) for item in actions)

        names = {item["args"]["name"] for item in actions}
        assert "90-minute DSA block" in names
        assert "Mock interview" in names
        assert "Project shipping checkpoint" in names

        execute = client.post(
            f"/api/chat/sessions/{session_id}/actions/execute",
            headers=auth_headers,
            json={"action": actions[0], "confirmed": False},
        )
        assert execute.status_code == 200
        assert execute.json()["status"] == "executed"

        tasks = client.get("/api/repetitive-tasks", headers=auth_headers)
        assert tasks.status_code == 200
        task_names = {task["name"] for task in tasks.json()}
        assert len(task_names.intersection(names)) >= 1
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_goal_coach_save_maps_weekly_and_monthly_frequencies(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = GoalRepetitivePlanProvider()
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
        )
        assert session.status_code == 201
        session_id = session.json()["id"]

        action = {
            "id": "act_frequency_map_1",
            "module": "repetitive_tasks",
            "type": "repetitive_tasks.create_task",
            "title": "Add repetitive task: Weekly-Monthly cadence",
            "rationale": "Goal coach suggested this cadence.",
            "confidence": "medium",
            "requires_confirmation": False,
            "destructive": False,
            "args": {
                "name": "Weekly-Monthly cadence",
                "description": "Coach generated plan cadence.",
                "frequencies": ["weekly", "monthly"],
                "priority": "medium",
                "linked_goal_ids": [goal_id],
                "linked_metric_ids": [],
            },
        }

        executed = client.post(
            f"/api/chat/sessions/{session_id}/actions/execute",
            headers=auth_headers,
            json={"action": action, "confirmed": False},
        )
        assert executed.status_code == 200
        execution = executed.json()
        assert execution["status"] == "executed"
        assert execution["action"]["args"]["frequencies"] == ["saturday", "end_of_month"]

        tasks = client.get("/api/repetitive-tasks", headers=auth_headers)
        assert tasks.status_code == 200
        saved = next(task for task in tasks.json() if task["name"] == "Weekly-Monthly cadence")
        assert saved["frequencies"] == ["saturday", "end_of_month"]
    finally:
        app.dependency_overrides.pop(get_provider, None)
