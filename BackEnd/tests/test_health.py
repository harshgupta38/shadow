"""Health-check routes."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_root_ok(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"]


def test_health_ok(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
