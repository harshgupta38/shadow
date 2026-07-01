"""Onboarding API tests (uses the fake LLM provider)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_questions_are_ordered(client: TestClient) -> None:
    response = client.get("/api/onboarding/questions")
    assert response.status_code == 200
    questions = response.json()
    assert len(questions) >= 5
    orders = [q["order"] for q in questions]
    assert orders == sorted(orders)


def test_answer_creates_understanding(client: TestClient, auth_headers: dict) -> None:
    response = client.post(
        "/api/onboarding/answer",
        headers=auth_headers,
        json={
            "question_id": "daily_focus",
            "question": "What does a productive day look like?",
            "category": "daily",
            "answer": "Deep work in the morning, no social media.",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["understanding"]
    assert body["memory"]["source"] == "onboarding"

    memories = client.get("/api/profile/memories", headers=auth_headers).json()
    assert len(memories) == 1


def test_complete_onboarding(client: TestClient, auth_headers: dict) -> None:
    response = client.post("/api/onboarding/complete", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["onboarding_completed"] is True
