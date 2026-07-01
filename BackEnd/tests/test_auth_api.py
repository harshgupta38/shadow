"""Auth API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import register_and_login


def test_register_returns_created_user(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "password": "password123", "name": "Ada"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "a@example.com"
    assert body["name"] == "Ada"
    assert "hashed_password" not in body


def test_register_duplicate_email_conflicts(client: TestClient) -> None:
    payload = {"email": "dup@example.com", "password": "password123", "name": "Dup"}
    client.post("/api/auth/register", json=payload)
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 409


def test_register_rejects_short_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"email": "b@example.com", "password": "short", "name": "B"},
    )
    assert response.status_code == 422


def test_login_and_me(client: TestClient) -> None:
    headers = register_and_login(client, email="me@example.com")
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


def test_login_wrong_password(client: TestClient) -> None:
    client.post(
        "/api/auth/register",
        json={"email": "c@example.com", "password": "password123", "name": "C"},
    )
    response = client.post(
        "/api/auth/login", json={"email": "c@example.com", "password": "nope"}
    )
    assert response.status_code == 401


def test_me_requires_auth(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401
