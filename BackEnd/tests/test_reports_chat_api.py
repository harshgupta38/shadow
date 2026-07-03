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
