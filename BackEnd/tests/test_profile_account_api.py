"""Profile account API tests — password change and account deletion."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import MemoryEntry, User
from tests.conftest import register_and_login


def test_change_password_success(client: TestClient) -> None:
    headers = register_and_login(client, email="pw@example.com", password="password123")

    response = client.put(
        "/api/profile/password",
        headers=headers,
        json={"current_password": "password123", "new_password": "newpassword456"},
    )
    assert response.status_code == 200

    # Old password no longer works; new one does.
    assert (
        client.post(
            "/api/auth/login", json={"email": "pw@example.com", "password": "password123"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "pw@example.com", "password": "newpassword456"},
        ).status_code
        == 200
    )


def test_change_password_wrong_current_is_rejected(client: TestClient) -> None:
    headers = register_and_login(client, email="pw2@example.com", password="password123")

    response = client.put(
        "/api/profile/password",
        headers=headers,
        json={"current_password": "wrongpass", "new_password": "newpassword456"},
    )
    # 400 (not 401) so the client is not spuriously logged out.
    assert response.status_code == 400


def test_delete_account_wrong_password_is_rejected(client: TestClient) -> None:
    headers = register_and_login(client, email="del0@example.com", password="password123")

    response = client.request(
        "DELETE",
        "/api/profile",
        headers=headers,
        json={"password": "wrongpass"},
    )
    assert response.status_code == 400
    # Account still usable.
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_delete_account_removes_user_and_related_data(client: TestClient) -> None:
    headers = register_and_login(client, email="del@example.com", password="password123")

    # Create a related row so we can prove cascade cleanup.
    client.post(
        "/api/profile/memories",
        headers=headers,
        json={"category": "other", "ai_understanding": "Remember me"},
    )

    with SessionLocal() as db:
        user_id = db.scalar(select(User.id).where(User.email == "del@example.com"))
        assert user_id is not None
        assert db.scalar(
            select(func.count()).select_from(MemoryEntry).where(MemoryEntry.user_id == user_id)
        ) == 1

    response = client.request(
        "DELETE",
        "/api/profile",
        headers=headers,
        json={"password": "password123"},
    )
    assert response.status_code == 204

    # Token is now invalid and the account is gone.
    assert client.get("/api/auth/me", headers=headers).status_code == 401

    with SessionLocal() as db:
        assert db.scalar(select(User.id).where(User.email == "del@example.com")) is None
        assert (
            db.scalar(
                select(func.count())
                .select_from(MemoryEntry)
                .where(MemoryEntry.user_id == user_id)
            )
            == 0
        )

    # Email is freed for re-registration.
    assert (
        client.post(
            "/api/auth/register",
            json={"email": "del@example.com", "password": "password123", "name": "Again"},
        ).status_code
        == 201
    )
