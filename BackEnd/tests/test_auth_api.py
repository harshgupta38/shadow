"""Auth API tests."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

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


def test_request_email_verification_and_verify_token(client: TestClient) -> None:
    headers = register_and_login(client, email="verify@example.com")

    request_response = client.post("/api/auth/request-email-verification", headers=headers)
    assert request_response.status_code == 200
    payload = request_response.json()
    assert "detail" in payload
    assert payload["email_sent"] in {True, False}
    assert payload["retry_after_seconds"] == 60
    assert payload["verification_url_preview"]
    assert payload["verification_url_preview"].startswith("https://shadow-pa.web.app/")

    cooldown_response = client.post("/api/auth/request-email-verification", headers=headers)
    assert cooldown_response.status_code == 200
    cooldown_payload = cooldown_response.json()
    assert cooldown_payload["email_sent"] is False
    assert cooldown_payload["verification_url_preview"] is None
    assert 1 <= cooldown_payload["retry_after_seconds"] <= 60

    parsed = urlparse(payload["verification_url_preview"])
    token = parse_qs(parsed.query)["token"][0]

    verify_response = client.get(f"/api/auth/verify-email?token={token}")
    assert verify_response.status_code == 200
    assert verify_response.json()["detail"] == "Email verified successfully"

    me_response = client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["email_verified"] is True


def test_verify_email_rejects_invalid_token(client: TestClient) -> None:
    register_and_login(client, email="invalid-verify@example.com")

    response = client.get("/api/auth/verify-email?token=not-a-real-token")
    assert response.status_code == 401
    assert response.json()["detail"] == "Verification link is invalid or expired"


def test_account_overview_includes_verification_cooldown(client: TestClient) -> None:
    headers = register_and_login(client, email="cooldown-overview@example.com")

    before = client.get("/api/profile/account", headers=headers)
    assert before.status_code == 200
    assert before.json()["verification_email_retry_after_seconds"] == 0

    request_response = client.post("/api/auth/request-email-verification", headers=headers)
    assert request_response.status_code == 200

    after = client.get("/api/profile/account", headers=headers)
    assert after.status_code == 200
    remaining = after.json()["verification_email_retry_after_seconds"]
    assert 1 <= remaining <= 60


def test_me_requires_auth(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401
