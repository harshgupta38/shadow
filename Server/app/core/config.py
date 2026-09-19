from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Shadow Control Server"
    app_version: str = "1.0.0"

    # Secret required in the X-Control-Secret header for all admin endpoints.
    control_secret: str = "change-this-in-production"

    # Filesystem paths to the two managed services.
    main_dir: str = "~/shadow/BackEnd_V2"
    backoffice_dir: str = "~/shadow/BackOffice/BackEnd"

    # Ports the managed services listen on (used for health checks).
    main_port: int = 8000
    backoffice_port: int = 8100

    @property
    def main_path(self) -> Path:
        return Path(self.main_dir).expanduser()

    @property
    def backoffice_path(self) -> Path:
        return Path(self.backoffice_dir).expanduser()

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
