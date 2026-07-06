"""Metrics, activity logs, plan and dashboard API tests."""

from __future__ import annotations

from datetime import date
from datetime import datetime, timezone
import json

from fastapi.testclient import TestClient

from app.api.deps import get_provider
from app.database import SessionLocal
from app.llm.base import LLMMessage, LLMProvider
from app.main import app
from app.models.enums import NotificationType
from app.models.notification import Notification


class ProgressMetricRecommendationProvider(LLMProvider):
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
        if "Habit name" in prompt and "LeetCode" in prompt:
            return (
                '{"measurable":true,"metric_name":"LeetCode solved","unit":"count",'
                '"daily_target":10,"rationale":"Problems solved is directly measurable."}'
            )
        return (
            '{"measurable":false,"metric_name":null,"unit":null,'
            '"daily_target":null,"rationale":"No measurable recommendation."}'
        )


def test_default_metrics_seeded_on_register(client: TestClient, auth_headers: dict) -> None:
    metrics = client.get("/api/metrics", headers=auth_headers).json()
    keys = {m["key"] for m in metrics}
    assert {"deep_work_minutes", "tasks_completed"} <= keys


def test_create_metric_and_log_activity(client: TestClient, auth_headers: dict) -> None:
    metric = client.post(
        "/api/metrics",
        headers=auth_headers,
        json={"key": "leetcode_solved", "label": "LeetCode solved", "unit": "count"},
    ).json()

    log = client.post(
        f"/api/metrics/{metric['id']}/logs",
        headers=auth_headers,
        json={"value": 3, "date": date.today().isoformat()},
    )
    assert log.status_code == 201
    logs = client.get(f"/api/metrics/{metric['id']}/logs", headers=auth_headers).json()
    assert logs[0]["value"] == 3


def test_duplicate_metric_key_conflicts(client: TestClient, auth_headers: dict) -> None:
    payload = {"key": "gym", "label": "Gym sessions", "unit": "count"}
    client.post("/api/metrics", headers=auth_headers, json=payload)
    response = client.post("/api/metrics", headers=auth_headers, json=payload)
    assert response.status_code == 409


def test_plan_task_completion(client: TestClient, auth_headers: dict) -> None:
    task = client.post(
        "/api/plan", headers=auth_headers, json={"title": "Write report"}
    ).json()
    updated = client.put(
        f"/api/plan/{task['id']}", headers=auth_headers, json={"status": "done"}
    ).json()
    assert updated["status"] == "done"
    assert updated["completed_at"] is not None


def test_plan_task_uses_planner_defaults(client: TestClient, auth_headers: dict) -> None:
    planner = client.put(
        "/api/settings/planner",
        headers=auth_headers,
        json={"default_reminder_time": "09:45", "default_task_duration_minutes": 60},
    )
    assert planner.status_code == 200

    task = client.post(
        "/api/plan",
        headers=auth_headers,
        json={"title": "Deep work block"},
    )
    assert task.status_code == 201
    task_json = task.json()
    assert task_json["reminder_time"] == "09:45"
    assert task_json["estimated_duration_minutes"] == 60

    notifications = client.get("/api/notifications", headers=auth_headers)
    assert notifications.status_code == 200
    assert any(n["title"].startswith("Task reminder:") for n in notifications.json())


def test_dashboard_summary(client: TestClient, auth_headers: dict) -> None:
    client.post("/api/goals", headers=auth_headers, json={"title": "Ship MVP"})
    client.post("/api/plan", headers=auth_headers, json={"title": "Task A"})

    summary = client.get("/api/dashboard/summary", headers=auth_headers).json()
    assert summary["goals_total"] >= 1
    assert summary["tasks_today_total"] >= 1
    assert isinstance(summary["metrics"], list)


def test_progress_coach_recommendation_accept_creates_metric_and_links_habit(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = ProgressMetricRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        habit = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "LeetCode practice",
                "description": "Solve 10 problems daily",
                "frequencies": ["daily"],
                "priority": "critical",
            },
        )
        assert habit.status_code == 201
        habit_id = habit.json()["id"]

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        assert recommendations.status_code == 200
        rows = recommendations.json()
        assert len(rows) == 1
        recommendation_id = rows[0]["id"]

        accepted = client.post(
            f"/api/metrics/progress-coach-recommendations/{recommendation_id}/accept",
            headers=auth_headers,
        )
        assert accepted.status_code == 200
        body = accepted.json()
        assert body["habit_id"] == habit_id
        assert body["metric"]["key"].startswith(f"habit_{habit_id}_")
        assert body["metric"]["target"] == 10

        # Recommendation is consumed.
        after = client.get("/api/metrics/progress-coach-recommendations", headers=auth_headers)
        assert after.status_code == 200
        assert after.json() == []

        # Habit now shows linked metric id.
        tasks = client.get("/api/repetitive-tasks", headers=auth_headers)
        assert tasks.status_code == 200
        linked = next(item for item in tasks.json() if item["id"] == habit_id)
        assert body["metric"]["id"] in linked["linked_metric_ids"]
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_progress_coach_accept_reuses_existing_metric_key(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    provider = ProgressMetricRecommendationProvider()
    app.dependency_overrides[get_provider] = lambda: provider

    try:
        habit = client.post(
            "/api/repetitive-tasks",
            headers=auth_headers,
            json={
                "name": "LeetCode practice",
                "description": "Solve 10 problems daily",
                "frequencies": ["daily"],
                "priority": "critical",
            },
        )
        assert habit.status_code == 201
        habit_id = habit.json()["id"]

        recommendations = client.get(
            "/api/metrics/progress-coach-recommendations",
            headers=auth_headers,
        )
        recommendation = recommendations.json()[0]

        # Pre-create metric with same key and different values.
        created = client.post(
            "/api/metrics",
            headers=auth_headers,
            json={
                "key": recommendation["metric_key"],
                "label": "Old label",
                "unit": "count",
                "target": 1,
            },
        )
        assert created.status_code == 201
        existing_metric_id = created.json()["id"]

        accepted = client.post(
            f"/api/metrics/progress-coach-recommendations/{recommendation['id']}/accept",
            headers=auth_headers,
        )
        assert accepted.status_code == 200
        body = accepted.json()
        assert body["metric"]["id"] == existing_metric_id
        assert body["metric"]["label"] == "LeetCode solved"
        assert body["metric"]["target"] == 10

        tasks = client.get("/api/repetitive-tasks", headers=auth_headers).json()
        linked = next(item for item in tasks if item["id"] == habit_id)
        assert existing_metric_id in linked["linked_metric_ids"]
    finally:
        app.dependency_overrides.pop(get_provider, None)


def test_progress_coach_list_hides_stale_non_quantifiable_recommendation(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    habit = client.post(
        "/api/repetitive-tasks",
        headers=auth_headers,
        json={
            "name": "Work from office",
            "description": "Travel and attend office weekdays",
            "frequencies": ["weekdays"],
            "priority": "medium",
        },
    )
    assert habit.status_code == 201
    habit_id = habit.json()["id"]

    title = f"__internal_progress_coach_metric_recommendation__:habit:{habit_id}"
    body = json.dumps(
        {
            "schema": "PROGRESS_COACH_RECOMMENDATION_V1",
            "habit_id": habit_id,
            "habit_name": "Work from office",
            "metric_name": "Office attendance",
            "metric_key": f"habit_{habit_id}_office_attendance",
            "unit": "count",
            "target": 1,
            "unit_hint": None,
            "rationale": "Daily completion count",
        }
    )

    with SessionLocal() as db:
        db.add(
            Notification(
                user_id=1,
                title=title,
                body=body,
                type=NotificationType.system,
                sent=True,
                read=True,
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

    listed = client.get("/api/metrics/progress-coach-recommendations", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json() == []
