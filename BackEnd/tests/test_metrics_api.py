"""Metrics, activity logs, plan and dashboard API tests."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient


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


def test_dashboard_summary(client: TestClient, auth_headers: dict) -> None:
    client.post("/api/goals", headers=auth_headers, json={"title": "Ship MVP"})
    client.post("/api/plan", headers=auth_headers, json={"title": "Task A"})

    summary = client.get("/api/dashboard/summary", headers=auth_headers).json()
    assert summary["goals_total"] >= 1
    assert summary["tasks_today_total"] >= 1
    assert isinstance(summary["metrics"], list)
