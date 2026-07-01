"""Tests for security helpers (hashing + JWT)."""

from __future__ import annotations

import pytest
from jose import JWTError

from app.services import security


def test_password_hash_and_verify() -> None:
    hashed = security.hash_password("s3cret-password")
    assert hashed != "s3cret-password"
    assert security.verify_password("s3cret-password", hashed) is True
    assert security.verify_password("wrong", hashed) is False


def test_verify_password_handles_bad_hash() -> None:
    assert security.verify_password("x", "not-a-real-hash") is False


def test_access_token_round_trip() -> None:
    token = security.create_access_token(42)
    payload = security.decode_token(token)
    assert payload["sub"] == "42"


def test_decode_invalid_token_raises() -> None:
    with pytest.raises(JWTError):
        security.decode_token("clearly.invalid.token")
