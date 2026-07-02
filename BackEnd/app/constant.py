"""Central constants & configuration for the Shadow backend.

This is the **single source of truth** for keys and config: API keys
(Gemini), the FrontEnd URL used for CORS, JWT secrets, the app version,
database URL, etc.

Design notes
------------
* 12-factor: every secret/environment-specific value is read from the
  environment (a local ``.env`` file in development). Plain module-level
  constants below hold only **non-secret** app metadata.
* Import ``settings`` anywhere you need configuration::

      from app.constant import settings
      settings.gemini_api_key

* ``get_settings()`` is cached, so the ``.env`` file is parsed once.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# ─────────────────────────────────────────────────────────────
# Non-secret application constants
# ─────────────────────────────────────────────────────────────
APP_NAME: str = "Shadow"
APP_DESCRIPTION: str = "Personal life & career assistant — API and AI layer."
VERSION: str = "0.1.0"
API_PREFIX: str = "/api"

# Supported LLM providers (the layer is pluggable — see app/llm).
PROVIDER_GEMINI: str = "gemini"
PROVIDER_FAKE: str = "fake"  # offline/deterministic provider for dev & tests


class Settings(BaseSettings):
    """Environment-driven settings.

    Values default to safe development values so the app boots without a
    ``.env`` file, but secrets (JWT, Gemini key) must be provided in any
    real deployment.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App metadata (mirrors the constants above; overridable via env) ──
    app_name: str = APP_NAME
    version: str = VERSION
    api_prefix: str = API_PREFIX
    environment: str = "development"
    debug: bool = True

    # ── Database ──────────────────────────────────────────────
    database_url: str = "sqlite:///./shadow.db"

    # ── Auth / JWT ────────────────────────────────────────────
    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24h

    # ── LLM / Gemini ──────────────────────────────────────────
    llm_provider: str = PROVIDER_GEMINI
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

    # ── CORS / FrontEnd URL ───────────────────────────────────
    # Comma-separated list of allowed origins (the FrontEnd URL(s)).
    cors_origins: str = "http://localhost:5173"

    # ── Scheduler ─────────────────────────────────────────────
    # Disable in tests to avoid spinning up background threads.
    enable_scheduler: bool = True

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse the comma-separated ``cors_origins`` into a clean list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    """Return the cached settings singleton."""
    return Settings()


# Import-friendly singleton.
settings: Settings = get_settings()
