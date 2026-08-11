from __future__ import annotations

import gspread
from google.oauth2.service_account import Credentials

from app.analysis.config import AnalysisSettings, analysis_settings
from app.analysis.models import APIUsageRecord, ErrorRecord, LLMUsageRecord

_SCOPES = (
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
)


class GoogleSheetsAnalysisClient:
    def __init__(self, settings: AnalysisSettings | None = None) -> None:
        self._settings = settings or analysis_settings
        self._spreadsheet = None
        self._worksheets: dict[str, object] = {}

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
            spreadsheet_name = self._settings.google_analytics_spreadsheet_name.strip()
            if not spreadsheet_name:
                raise ValueError(
                    "Configure GOOGLE_ANALYTICS_SPREADSHEET_ID or GOOGLE_ANALYTICS_SPREADSHEET_NAME."
                )
            self._spreadsheet = client.open(spreadsheet_name)

        return self._spreadsheet

    def _get_worksheet(self, worksheet_name: str):
        worksheet_key = worksheet_name.strip()
        if not worksheet_key:
            raise ValueError("Worksheet name is required.")

        worksheet = self._worksheets.get(worksheet_key)
        if worksheet is not None:
            return worksheet

        spreadsheet = self._get_spreadsheet()
        worksheet = spreadsheet.worksheet(worksheet_key)
        self._worksheets[worksheet_key] = worksheet
        return worksheet

    def append_llm_usage(self, record: LLMUsageRecord) -> None:
        worksheet_name = self._settings.google_analytics_llm_worksheet.strip()
        worksheet = self._get_worksheet(worksheet_name)
        worksheet.append_row(record.to_sheet_row(), value_input_option="USER_ENTERED")

    def append_api_usage(self, record: APIUsageRecord) -> None:
        worksheet_name = self._settings.google_analytics_api_worksheet.strip()
        worksheet = self._get_worksheet(worksheet_name)
        worksheet.append_row(record.to_sheet_row(), value_input_option="USER_ENTERED")

    def append_error(self, record: ErrorRecord) -> None:
        worksheet_name = self._settings.google_analytics_errors_worksheet.strip()
        worksheet = self._get_worksheet(worksheet_name)
        worksheet.append_row(record.to_sheet_row(), value_input_option="USER_ENTERED")
