"""Reports & chat API tests (fake LLM provider)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient


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

    messages = client.get(
        f"/api/chat/sessions/{session['id']}/messages", headers=auth_headers
    ).json()
    assert len(messages) == 2
