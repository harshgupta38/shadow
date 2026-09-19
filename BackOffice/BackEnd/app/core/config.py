from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Shadow BackOffice API"
    app_version: str = "1.0.0"
    api_prefix: str = "/v2"

    # Auth-cookie SameSite policy: "strict" | "lax" | "none".
    same_site: str = "strict"

    # BackOffice's OWN database — deployment/restart/audit logs and the admin
    # login. Never the same file as Shadow V2's shadow.db.
    database_url: str = "sqlite:///./backoffice.db"

    jwt_secret: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720  # 12 hours — single admin, no refresh flow

    # Comma-separated list of allowed CORS origins (the BackOffice frontend).
    cors_origins: str = "http://localhost:5200"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    # ─── Shadow V2 integration ───────────────────────────────────────────────
    # BackOffice runs co-located with BackEnd_V2 on the same Termux device.
    # shadow_backend_dir is used only for read-only host/process introspection
    # (worker_service.py) — every git/restart/deploy action goes through the
    # Control Server instead (see below), never a direct subprocess call.
    shadow_backend_dir: str = "~/shadow/BackEnd_V2"
    shadow_backend_url: str = "http://127.0.0.1:8000"

    # Must match the _ADMIN_SECRET constant in BackEnd_V2/app/api/system.py —
    # BackOffice never introduces a new SQL-execution mechanism, it calls the
    # existing /admin/sql and /admin/database endpoints with this header.
    shadow_admin_secret: str = ""

    # Shared secret for BackOffice's OWN /admin/sql and /admin/database.
    admin_secret: str = "change-this-in-production"

    # ─── Control Server integration ──────────────────────────────────────────
    # The Server/ control plane (port 9000) is what actually runs git
    # fetch/checkout/pull and restart_server.sh / restart_backoffice.sh — for
    # both Shadow V2 and BackOffice itself. No branch name lives in config
    # anywhere; deploy always pulls whatever branch is currently checked out
    # unless a caller explicitly requests a different one.
    control_server_url: str = "http://127.0.0.1:9000"
    control_secret: str = "change-this-in-production"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
