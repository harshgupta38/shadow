from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AnalysisSettings(BaseSettings):
    analysis_enabled: bool = Field(default=False, alias="ANALYSIS_ENABLED")

    google_analytics_credentials_file: str = Field(
        default="",
        alias="GOOGLE_ANALYTICS_CREDENTIALS_FILE",
    )

    google_analytics_spreadsheet_id: str = Field(
        default="",
        alias="GOOGLE_ANALYTICS_SPREADSHEET_ID",
    )

    google_analytics_spreadsheet_name: str = Field(
        default="Shadow Analyst",
        alias="GOOGLE_ANALYTICS_SPREADSHEET_NAME",
    )

    google_analytics_llm_worksheet: str = Field(
        default="LLM Usage",
        alias="GOOGLE_ANALYTICS_LLM_WORKSHEET",
    )

    google_analytics_api_worksheet: str = Field(
        default="API Usage",
        alias="GOOGLE_ANALYTICS_API_WORKSHEET",
    )
    
    google_analytics_errors_worksheet: str = Field(
        default="Errors",
        alias="GOOGLE_ANALYTICS_ERRORS_WORKSHEET",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True,
    )


analysis_settings = AnalysisSettings()
