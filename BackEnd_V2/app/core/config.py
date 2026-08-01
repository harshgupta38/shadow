from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Shadow API"
    app_version: str = "2.0.0"
    api_prefix: str = "/api"

    database_url: str = "sqlite:///shadow.db"
    jwt_secret: str = "change-this-in-production"
    jwt_algorithm: str = "HS256"

    access_token_expire_minutes: int = 60 * 24 * 30

    cors_origins_list: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()
