from __future__ import annotations

import gspread
from google.oauth2.service_account import Credentials

from app.analysis.config import AnalysisSettings, analysis_settings
from app.analysis.models import LLMUsageRecord

_SCOPES = (
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
)


class GoogleSheetsAnalysisClient:
    def __init__(self, settings: AnalysisSettings | None = None) -> None:
        self._settings = settings or analysis_settings
        self._spreadsheet = None
        self._llm_worksheet = None

    def _get_spreadsheet(self):
        if self._spreadsheet is not None:
            return self._spreadsheet

        credentials_file = self._settings.google_analytics_credentials_file.strip()
        if not credentials_file:
            raise ValueError("GOOGLE_ANALYTICS_CREDENTIALS_FILE is not configured.")

        credentials = Credentials.from_service_account_file(
            credentials_file,
            scopes=_SCOPES,
        )
        client = gspread.authorize(credentials)

        spreadsheet_id = self._settings.google_analytics_spreadsheet_id.strip()
        if spreadsheet_id:
            self._spreadsheet = client.open_by_key(spreadsheet_id)
        else:
            raise ValueError("GOOGLE_ANALYTICS_SPREADSHEET_ID is not configured.")

        return self._spreadsheet

    def _get_llm_worksheet(self):
        if self._llm_worksheet is not None:
            return self._llm_worksheet

        worksheet_name = self._settings.google_analytics_llm_worksheet.strip()
        if not worksheet_name:
            raise ValueError("GOOGLE_ANALYTICS_LLM_WORKSHEET is not configured.")

        spreadsheet = self._get_spreadsheet()
        self._llm_worksheet = spreadsheet.worksheet(worksheet_name)
        return self._llm_worksheet

    def append_llm_usage(self, record: LLMUsageRecord) -> None:
        worksheet = self._get_llm_worksheet()
        worksheet.append_row(record.to_sheet_row(), value_input_option="USER_ENTERED")
