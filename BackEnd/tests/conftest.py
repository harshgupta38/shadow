"""Pytest fixtures — hermetic SQLite DB, fake LLM, and an auth helper.

Environment is forced to safe test values **before** importing the app so
the cached settings pick them up. Never touches a real database or Gemini.
"""

from __future__ import annotations

import os

# ── Force test configuration BEFORE importing the app ─────────
os.environ["DATABASE_URL"] = "sqlite:///./_test_shadow.db"
os.environ["LLM_PROVIDER"] = "fake"
os.environ["JWT_SECRET"] = "test-secret-key"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["GEMINI_API_KEY"] = ""

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_database() -> Generator[None, None, None]:
    """Give every test a clean schema."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


def register_and_login(
    client: TestClient,
    *,
    email: str = "user@example.com",
    password: str = "password123",
    name: str = "Test User",
) -> dict[str, str]:
    """Register a user, log in, and return an auth header dict."""
    client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "name": name},
    )
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    return register_and_login(client)
