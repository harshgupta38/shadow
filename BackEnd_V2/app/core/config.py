from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Shadow API"
    app_version: str = "2.0.0"
    api_prefix: str = "/v2"

    # Auth-cookie SameSite policy: "strict" | "lax" | "none".
    # "none" allows cross-site clients (e.g. a local dev frontend calling this
    # API) and requires HTTPS — browsers refuse SameSite=None cookies without
    # Secure=True, so this only works when the backend is actually served over
    # HTTPS. Leave as "strict" for normal same-site deployments.
    same_site: str = "strict"

    database_url: str = "sqlite:///shadow.db"
    jwt_secret: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"

    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # Comma-separated list of allowed CORS origins.
    cors_origins: str = "http://localhost:5173,http://localhost:5174"

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]

    # DB backup scheduler — comma-separated HHMM values, e.g. "0800,1600,2359".
    # Leave empty to disable backups.
    db_backup_runtimes: str = "2355"
    db_backup_limit: int = Field(default=30, ge=10)
    db_backup_dir: str = "backups"

    @property
    def db_backup_runtime_list(self) -> list[str]:
        return [t.strip() for t in self.db_backup_runtimes.split(",") if t.strip()]

    # How many uvicorn workers restart_server.sh starts (its own --workers
    # flag) — not read by that script, just declared here so /health can
    # report the *intended* worker count. BackOffice compares this against
    # the *actual* running count (psutil, from its own process) — a
    # mismatch (e.g. 3 of 4) means a worker died without the group
    # restarting, which BackOffice's own process introspection alone can't
    # tell apart from "this server is only ever meant to run 3."
    workers: int = Field(default=4, ge=1)

    # Report auto-generation scheduler — global kill-switch on top of each
    # user's own per-cadence schedule (UserSettingDBM.reports, default 23:55 IST).
    # REPORT_AUTO_GENERATE=false disables the scheduler entirely.
    report_auto_generate: bool = False

    # Frontend base URL — used to build links inside email notifications.
    frontend_base_url: str = "https://shadowassistant.in"

    # SMTP — leave smtp_host empty to disable email entirely.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_from_email: str = "no-reply@shadowassistant.in"
    smtp_from_name: str = "Shadow"

    # Web Push (VAPID). Generate keys with:
    #   python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key.public_bytes_raw().hex())"
    # or use https://web-push-codelab.glitch.me/
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@shadow.app"

    # Optional IP geolocation for security alert emails (failed login attempts).
    # Used only for approximate city/region/country in the alert — never blocks
    # the request path (looked up in a background thread) and fails silently.
    ip_geolocation_enabled: bool = False
    ip_geolocation_base_url: str = "http://ip-api.com/json/{ip}?fields=status,country,regionName,city,lat,lon"
    ip_geolocation_timeout_seconds: float = 2.5

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
