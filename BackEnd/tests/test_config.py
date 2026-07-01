"""Tests for central configuration (app/constant.py)."""

from __future__ import annotations

from app.constant import VERSION, Settings


def test_version_is_set() -> None:
    assert VERSION
    assert isinstance(VERSION, str)


def test_cors_origins_parsed_into_list() -> None:
    settings = Settings(cors_origins="http://a.com, http://b.com ,")
    assert settings.cors_origins_list == ["http://a.com", "http://b.com"]


def test_is_sqlite_detection() -> None:
    assert Settings(database_url="sqlite:///./x.db").is_sqlite is True
    assert Settings(database_url="postgresql://u@h/db").is_sqlite is False


def test_defaults_are_safe() -> None:
    settings = Settings()
    assert settings.jwt_algorithm == "HS256"
    assert settings.access_token_expire_minutes > 0
