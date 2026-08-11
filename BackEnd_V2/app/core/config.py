from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Shadow API"
    app_version: str = "2.0.0"
    api_prefix: str = "/api"

    database_url: str = "sqlite:///shadow.db"
    jwt_secret: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"

    access_token_expire_minutes: int = 60 * 24 * 30

    # Comma-separated list of allowed CORS origins.
    cors_origins: str = "http://localhost:5173,http://localhost:5174"

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
